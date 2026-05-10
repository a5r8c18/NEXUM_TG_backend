import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { VoucherService } from '../accounting/voucher.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Movement } from '../entities/movement.entity';
import { PaginationService } from '../common/pagination/pagination.service';
import {
  PaginationDto,
  PaginationResult,
} from '../common/pagination/pagination.dto';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly paginationService: PaginationService,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
  ) {}

  async findAll(
    companyId: number,
    filters?: {
      customerName?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<PaginationResult<Invoice>> {
    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.items', 'items')
      .where('inv.company_id = :companyId', { companyId });

    if (filters?.customerName) {
      qb.andWhere('LOWER(inv.customer_name) LIKE :cn', {
        cn: `%${filters.customerName.toLowerCase()}%`,
      });
    }
    if (filters?.status) {
      qb.andWhere('inv.status = :status', { status: filters.status });
    }
    if (filters?.startDate) {
      qb.andWhere('inv.date >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      qb.andWhere('inv.date <= :endDate', { endDate: filters.endDate });
    }

    qb.orderBy('inv.createdAt', 'DESC');

    // Apply pagination
    const paginationDto = new PaginationDto();
    if (filters?.page) paginationDto.page = filters.page;
    if (filters?.limit) paginationDto.limit = filters.limit;

    return await this.paginationService.paginate(qb, paginationDto);
  }

  async findOne(companyId: number, id: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!invoice) throw new NotFoundException(`Factura #${id} no encontrada`);
    return { invoice };
  }

  async create(
    companyId: number,
    data: {
      customerName: string;
      customerId?: string;
      customerAddress?: string;
      customerPhone?: string;
      date?: string;
      taxRate?: number;
      discount?: number;
      notes?: string;
      createdByName?: string;
      items: Array<{
        productCode?: string;
        description: string;
        quantity: number;
        unitPrice: number;
      }>;
    },
  ) {
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException('La factura debe tener al menos un item');
    }

    for (const item of data.items) {
      if (item.productCode) {
        const inv = await this.inventoryService.findByCode(
          companyId,
          item.productCode,
        );
        if (inv && inv.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${item.description}. Disponible: ${inv.stock}, Requerido: ${item.quantity}`,
          );
        }
      }
    }

    const count = await this.invoiceRepo.count({ where: { companyId } });
    const now = new Date().toISOString();

    const subtotal = data.items.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice,
      0,
    );
    const taxRate = data.taxRate ?? 16;
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const discount = data.discount ?? 0;
    const total = Math.round((subtotal + taxAmount - discount) * 100) / 100;

    const invoice = await this.invoiceRepo.save(
      this.invoiceRepo.create({
        companyId,
        invoiceNumber: `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
        customerName: data.customerName,
        customerId: data.customerId || '',
        customerAddress: data.customerAddress || '',
        customerPhone: data.customerPhone || '',
        date: data.date || now.split('T')[0],
        subtotal,
        taxRate,
        taxAmount,
        discount,
        total,
        status: 'pending',
        notes: data.notes || '',
        createdByName: data.createdByName || 'Admin',
      }),
    );

    const items: InvoiceItem[] = [];
    for (const item of data.items) {
      const ii = await this.invoiceItemRepo.save(
        this.invoiceItemRepo.create({
          invoiceId: invoice.id,
          productCode: item.productCode || '',
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
        }),
      );
      items.push(ii);

      if (item.productCode) {
        try {
          await this.inventoryService.updateStock(
            companyId,
            item.productCode,
            item.quantity,
            'exit',
          );
          await this.movementRepo.save(
            this.movementRepo.create({
              companyId,
              movementType: 'exit',
              productCode: item.productCode,
              quantity: item.quantity,
              reason: `Factura ${invoice.invoiceNumber}`,
              userName: data.createdByName || 'System',
            }),
          );
        } catch {
          // stock already validated above
        }
      }
    }

    invoice.items = items;

    // ── Contabilización automática de factura (venta) ──
    const invoiceTotal = Number(invoice.total || 0);
    if (invoiceTotal > 0) {
      try {
        await this.voucherService.createVoucherFromModule(
          companyId,
          'invoices',
          invoice.id,
          {
            date: invoice.date || new Date().toISOString().split('T')[0],
            description: `Factura ${invoice.invoiceNumber} - ${invoice.customerName}`,
            type: 'sales',
            reference: `FAC-${invoice.invoiceNumber}`,
            createdBy: data.createdByName || 'Sistema',
            lines: [
              {
                accountCode: '135', // Cuentas por Cobrar a Clientes
                debit: invoiceTotal,
                credit: 0,
                description: `Cobro pendiente ${invoice.invoiceNumber}`,
              },
              {
                accountCode: '900', // Ventas
                debit: 0,
                credit: invoiceTotal,
                description: `Venta ${invoice.invoiceNumber}`,
              },
            ],
          },
        );
      } catch (error) {
        this.logger.error(`Error contabilización factura ${invoice.id}: ${error.message}`);
      }
    }

    return { invoice };
  }

  async update(companyId: number, id: string, data: Record<string, any>) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!invoice) throw new NotFoundException(`Factura #${id} no encontrada`);
    Object.assign(invoice, data);
    const saved = await this.invoiceRepo.save(invoice);
    return { invoice: saved };
  }

  async remove(companyId: number, id: string) {
    const invoice = await this.invoiceRepo.findOneBy({ id, companyId });
    if (!invoice) throw new NotFoundException(`Factura #${id} no encontrada`);
    await this.invoiceRepo.softRemove(invoice);
    return { message: 'Factura eliminada correctamente' };
  }

  async updateStatus(companyId: number, id: string, status: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!invoice) throw new NotFoundException(`Factura #${id} no encontrada`);

    const prevStatus = invoice.status;
    invoice.status = status;

    // ── Inventory reversal on cancellation ──
    if (status === 'cancelled' && prevStatus !== 'cancelled') {
      for (const item of invoice.items) {
        if (item.productCode) {
          try {
            await this.inventoryService.updateStock(
              companyId,
              item.productCode,
              item.quantity,
              'entry',
            );
            await this.movementRepo.save(
              this.movementRepo.create({
                companyId,
                movementType: 'entry',
                productCode: item.productCode,
                quantity: item.quantity,
                reason: `Cancelación factura ${invoice.invoiceNumber}`,
                userName: 'System',
              }),
            );
          } catch {
            // best-effort revert
          }
        }
      }
    }

    // ── Contabilización al marcar como PAGADA ──
    if (status === 'paid' && prevStatus !== 'paid') {
      const total = Number(invoice.total || 0);
      if (total > 0) {
        try {
          await this.voucherService.createVoucherFromModule(
            companyId,
            'invoices',
            invoice.id,
            {
              date: new Date().toISOString().split('T')[0],
              description: `Cobro factura ${invoice.invoiceNumber}`,
              type: 'sales',
              reference: `COBRO-${invoice.invoiceNumber}`,
              createdBy: 'Sistema',
              lines: [
                {
                  accountCode: '101', // Efectivo en Caja
                  debit: total,
                  credit: 0,
                  description: `Cobro factura ${invoice.invoiceNumber}`,
                },
                {
                  accountCode: '135', // Cuentas por Cobrar
                  debit: 0,
                  credit: total,
                  description: `Liquidación CxC ${invoice.invoiceNumber}`,
                },
              ],
            },
          );
        } catch (error) {
          this.logger.error(`Error contabilización cobro ${invoice.id}: ${error.message}`);
        }
      }
    }

    // ── Contabilización reverso al CANCELAR ──
    if (status === 'cancelled' && prevStatus !== 'cancelled') {
      const total = Number(invoice.total || 0);
      if (total > 0) {
        try {
          await this.voucherService.createVoucherFromModule(
            companyId,
            'invoices',
            invoice.id,
            {
              date: new Date().toISOString().split('T')[0],
              description: `Cancelación factura ${invoice.invoiceNumber}`,
              type: 'sales',
              reference: `CANCEL-${invoice.invoiceNumber}`,
              createdBy: 'Sistema',
              lines: [
                {
                  accountCode: '900', // Ventas (reverso)
                  debit: total,
                  credit: 0,
                  description: `Reverso venta ${invoice.invoiceNumber}`,
                },
                {
                  accountCode: '135', // Cuentas por Cobrar (reverso)
                  debit: 0,
                  credit: total,
                  description: `Reverso CxC ${invoice.invoiceNumber}`,
                },
              ],
            },
          );
        } catch (error) {
          this.logger.error(`Error contabilización cancelación ${invoice.id}: ${error.message}`);
        }
      }
    }

    const saved = await this.invoiceRepo.save(invoice);
    return { invoice: saved };
  }

  async getStatistics(companyId: number) {
    const invoices = await this.invoiceRepo.find({ where: { companyId } });
    const paid = invoices.filter((i) => i.status === 'paid');
    const pending = invoices.filter((i) => i.status === 'pending');
    const cancelled = invoices.filter((i) => i.status === 'cancelled');

    return {
      totalInvoices: invoices.length,
      totalAmount: invoices.reduce((sum, i) => sum + Number(i.total), 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, i) => sum + Number(i.total), 0),
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, i) => sum + Number(i.total), 0),
      cancelledCount: cancelled.length,
      cancelledAmount: cancelled.reduce((sum, i) => sum + Number(i.total), 0),
    };
  }
}
