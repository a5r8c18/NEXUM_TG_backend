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
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { ProductsService } from '../products/products.service';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Movement } from '../entities/movement.entity';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { Company } from '../entities/company.entity';
import { PaginationService } from '../common/pagination/pagination.service';
import {
  PaginationDto,
  PaginationResult,
} from '../common/pagination/pagination.dto';
import { getMovementType } from '../movements/movement-types.catalog';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly inventoryWarehouseService: InventoryWarehouseService,
    private readonly productsService: ProductsService,
    private readonly paginationService: PaginationService,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    private readonly accountMappingService: AccountMappingService,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(AccountReceivable)
    private readonly arRepo: Repository<AccountReceivable>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
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
        const inventories = await this.inventoryWarehouseService.findByCode(
          companyId,
          item.productCode,
        );
        // Usar el primer almacén encontrado (o implementar lógica de selección)
        const inv = inventories[0];
        if (inv && inv.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${item.description}. Disponible: ${inv.stock}, Requerido: ${item.quantity}`,
          );
        }
      }
    }

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const count = await this.invoiceRepo.count({ where: { companyId } });
    const now = new Date().toISOString();

    const subtotal = data.items.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice,
      0,
    );
    const discount = data.discount ?? 0;
    const taxable = Math.round((subtotal - discount) * 100) / 100;
    const taxRate = data.taxRate ?? company.salesTaxRate ?? 0;
    const taxAmount = Math.round(taxable * (taxRate / 100) * 100) / 100;
    const total = Math.round((taxable + taxAmount) * 100) / 100;

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
          // Obtener producto para determinar categoría y código de movimiento
          const product = await this.productsService.findByCode(companyId, item.productCode);
          const inventories = await this.inventoryWarehouseService.findByCode(companyId, item.productCode);
          const inventory = inventories[0]; // Primer almacén
          
          // Determinar código de movimiento según categoría
          let movCode = '2100'; // Default: Ventas a Clientes - Mercancía
          if (product?.category === 'insumo') {
            movCode = '1101'; // Venta a trabajadores - Insumo (usar para ventas también)
          } else if (product?.category === 'produccion') {
            movCode = '3100'; // Ventas a Clientes - Producción
          }

          // Actualizar stock
          await this.inventoryWarehouseService.updateStock(
            companyId,
            item.productCode,
            inventory.warehouseId,
            item.quantity,
            'exit',
          );

          // Crear movimiento con código cubano
          const movType = getMovementType(movCode);
          await this.movementRepo.save(
            this.movementRepo.create({
              companyId,
              movementType: 'exit',
              movementCode: movCode,
              movementDescription: movType?.description || 'Ventas a Clientes',
              category: product?.category || 'mercancia',
              productCode: item.productCode,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalAmount: item.quantity * item.unitPrice,
              reason: `Factura ${invoice.invoiceNumber}`,
              sourceWarehouse: inventory.warehouseId,
              userName: data.createdByName || 'System',
            }),
          );
        } catch (error) {
          this.logger.error(`Error creando movimiento para factura ${invoice.invoiceNumber}: ${error.message}`);
          // stock already validated above
        }
      }
    }

    invoice.items = items;

    // ── Contabilización automática de factura (venta + costo de ventas) ──
    const invoiceTotal = Number(invoice.total || 0);
    if (invoiceTotal > 0) {
      try {
        // 1. Contabilizar venta (ingreso) con impuesto sobre ventas
        // Partida doble: DEBE 135 Cuentas por Cobrar / HABER 900 Ventas + 440-0001 Impuesto sobre Ventas
        const receivableAccount =
          (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_RECEIVABLE)) || '135';
        const salesAccount =
          (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_SALE)) || '900';

        const salesLines: any[] = [
          {
            accountCode: receivableAccount,
            debit: invoiceTotal,
            credit: 0,
            description: `Cobro pendiente ${invoice.invoiceNumber}`,
          },
          {
            accountCode: salesAccount,
            debit: 0,
            credit: taxable,
            description: `Venta ${invoice.invoiceNumber}`,
          },
        ];

        if (taxAmount > 0) {
          salesLines.push({
            accountCode: '440-0001', // Impuesto sobre Ventas
            debit: 0,
            credit: taxAmount,
            description: `Impuesto sobre Ventas ${invoice.invoiceNumber}`,
          });
        }

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
            lines: salesLines,
          },
        );

        // 2. Contabilizar costo de ventas (solo para productos con inventario)
        let costOfSales = 0;
        const costLines: any[] = [];

        for (const item of invoice.items) {
          if (item.productCode) {
            const wac = await this.inventoryWarehouseService.getWeightedAverageCost(
              companyId,
              item.productCode,
            );
            if (!wac) continue;

            const itemCost = item.quantity * wac.unitCost;
            costOfSales += itemCost;

            costLines.push({
              accountCode: await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_EXIT) || '810',
              debit: itemCost,
              credit: 0,
              description: `Costo venta ${item.productCode} (WAC: ${wac.unitCost})`,
            });

            costLines.push({
              accountCode: await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_ENTRY) || '189',
              debit: 0,
              credit: itemCost,
              description: `Salida inventario ${item.productCode} (WAC: ${wac.unitCost})`,
            });
          }
        }

        // Generar comprobante de costo de ventas si hay productos de inventario
        if (costOfSales > 0) {
          await this.voucherService.createVoucherFromModule(
            companyId,
            'invoices',
            `${invoice.id}-cost`,
            {
              date: invoice.date || new Date().toISOString().split('T')[0],
              description: `Costo de ventas - Factura ${invoice.invoiceNumber}`,
              type: 'cost_of_sales',
              reference: `COST-FAC-${invoice.invoiceNumber}`,
              createdBy: data.createdByName || 'Sistema',
              lines: costLines,
            },
          );
        }
      } catch (error) {
        this.logger.error(`Error contabilización factura ${invoice.id}: ${error.message}`);
      }
    }

    // Crear AccountReceivable automáticamente
    const arCount = await this.arRepo.count({ where: { companyId } });
    const arNumber = `CC-${new Date().getFullYear()}-${String(arCount + 1).padStart(4, '0')}`;
    
    const accountReceivable = await this.arRepo.save(
      this.arRepo.create({
        arNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerId: invoice.customerId || null,
        customerAddress: invoice.customerAddress || null,
        customerPhone: invoice.customerPhone || null,
        customerEmail: null,
        customerNit: null,
        originalAmount: Number(invoice.total),
        balanceAmount: Number(invoice.total),
        paidAmount: 0,
        dueDate: new Date(new Date(invoice.date).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 días por defecto
        agingDays: 0,
        agingCategory: 'current',
        status: 'pending',
        priority: 'normal',
        creditLimit: null,
        availableCredit: null,
        collectionNotes: null,
        companyId,
      }),
    );

    this.logger.log(`CxC creada para factura ${invoice.invoiceNumber}: ${arNumber}`);

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
            // Need to get warehouseId for stock reversal - using first available warehouse
            const inventories = await this.inventoryWarehouseService.findByCode(companyId, item.productCode);
            const warehouseId = inventories[0]?.warehouseId;
            if (warehouseId) {
              await this.inventoryWarehouseService.updateStock(
                companyId,
                item.productCode,
                warehouseId,
                item.quantity,
                'entry',
              );
            }
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
          const cashAccount =
            (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_PAYMENT)) || '101';
          const receivableAccount =
            (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_RECEIVABLE)) || '135';
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
                  accountCode: cashAccount, // Efectivo/Banco (tesorería)
                  debit: total,
                  credit: 0,
                  description: `Cobro factura ${invoice.invoiceNumber}`,
                },
                {
                  accountCode: receivableAccount, // Cuentas por Cobrar
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
          const salesAccount =
            (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_SALE)) || '900';
          const receivableAccount =
            (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_RECEIVABLE)) || '135';
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
                  accountCode: salesAccount, // Ventas (reverso)
                  debit: total,
                  credit: 0,
                  description: `Reverso venta ${invoice.invoiceNumber}`,
                },
                {
                  accountCode: receivableAccount, // Cuentas por Cobrar (reverso)
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
