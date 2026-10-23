import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { ProductsService } from '../products/products.service';
import { MovementsService } from '../movements/movements.service';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Movement } from '../entities/movement.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { Customer } from '../entities/customer.entity';
import { Company } from '../entities/company.entity';
import { PaginationService } from '../common/pagination/pagination.service';
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';
import { FinanceService } from '../finance/finance.service';
import {
  PaginationDto,
  PaginationResult,
} from '../common/pagination/pagination.dto';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly inventoryWarehouseService: InventoryWarehouseService,
    private readonly productsService: ProductsService,
    private readonly movementsService: MovementsService,
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
    private readonly sequenceService: DocumentSequenceService,
    @Inject(forwardRef(() => FinanceService))
    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
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
      saleType?: 'client' | 'worker';
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

    const invoiceWarehouseId = data['warehouseId'];

    // Validación temprana de stock (falla con mensaje claro antes de abrir la transacción)
    for (const item of data.items) {
      if (item.productCode) {
        const inventories = await this.inventoryWarehouseService.findByCode(
          companyId,
          item.productCode,
        );
        const inv = (invoiceWarehouseId
          ? inventories.find(i => i.warehouseId === invoiceWarehouseId)
          : inventories[0]) || inventories[0];
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

    const result = await this.dataSource.transaction(async (manager) => {
      const now = new Date().toISOString();
      const invoiceDate = data.date || now.split('T')[0];
      const invoiceYear = new Date(invoiceDate).getFullYear();
      const invoiceNumber = await this.sequenceService.nextFormatted(
        companyId,
        'invoice',
        'INV',
        { year: invoiceYear, padding: 4, includeYear: true, manager },
      );

      const subtotal = data.items.reduce(
        (sum, i) => sum + i.quantity * i.unitPrice,
        0,
      );
      const discount = data.discount ?? 0;
      const taxable = Math.round((subtotal - discount) * 100) / 100;
      const taxRate = data.taxRate ?? company.salesTaxRate ?? 0;
      const taxAmount = Math.round(taxable * (taxRate / 100) * 100) / 100;
      const total = Math.round((taxable + taxAmount) * 100) / 100;

      const invoice = await manager.getRepository(Invoice).save(
        this.invoiceRepo.create({
          companyId,
          invoiceNumber,
          customerName: data.customerName,
          customerId: data.customerId || '',
          customerAddress: data.customerAddress || '',
          customerPhone: data.customerPhone || '',
          date: invoiceDate,
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

      const saleType = data.saleType || 'client';
      const items: InvoiceItem[] = [];

      for (const item of data.items) {
        const ii = await manager.getRepository(InvoiceItem).save(
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
      }

      // ── Salida de inventario + costo de ventas (delegado a Inventario) ──
      // Facturación NO descuenta stock ni contabiliza el costo: esa
      // responsabilidad es del subsistema de inventario, que captura el WAC
      // antes de la salida, crea el Movement y genera el voucher de costo
      // (810/814 D / Inventario H) con sourceModule='inventory'.
      const saleItems = data.items
        .filter(i => i.productCode)
        .map(i => ({ productCode: i.productCode as string, quantity: i.quantity }));

      const saleExit = await this.movementsService.registerSaleExit(
        companyId,
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          saleType,
          warehouseId: invoiceWarehouseId,
          items: saleItems,
          userName: data.createdByName,
        },
        manager,
      );

      // Vale de Venta (SC-2-08) — documento del subsistema de inventario
      if (saleExit.movementItems.length && saleExit.warehouseId) {
        const salePriceByProduct = new Map<string, number>();
        for (const item of data.items) {
          if (item.productCode) {
            salePriceByProduct.set(item.productCode, item.unitPrice);
          }
        }
        const valeProducts = saleExit.movementItems.map((mi) => ({
          code: mi.productCode,
          name: mi.productName,
          quantity: mi.quantity,
          unitPrice: salePriceByProduct.get(mi.productCode as string) || 0,
        }));

        try {
          await manager.getRepository(DeliveryReport).save(
            manager.getRepository(DeliveryReport).create({
              companyId,
              reportNumber: `VV-${invoice.invoiceNumber}`,
              reportDate: new Date(invoice.date),
              entityName: invoice.customerName,
              entityNit: invoice.customerId || null,
              warehouseId: saleExit.warehouseId,
              warehouseName: saleExit.warehouseName,
              authorizationDocument: invoice.invoiceNumber,
              products: JSON.stringify(valeProducts),
              totalAmount: Number(invoice.total),
              reportType: 'SC-2-08',
              observations: `Venta según factura ${invoice.invoiceNumber}`,
              status: 'delivered',
              createdByName: data.createdByName || 'System',
            }),
          );
        } catch (error) {
          this.logger.error(
            `Error creando vale de venta para factura ${invoice.invoiceNumber}: ${error.message}`,
          );
        }
      }

      invoice.items = items;

      // ── Contabilización de la VENTA (ingreso) ──
      // Facturación solo genera el asiento comercial: 135 D / 900 H + 440-0001 H.
      // El costo de ventas ya lo contabilizó Inventario.
      const invoiceTotal = Number(invoice.total || 0);
      if (invoiceTotal > 0) {
        try {
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
              reference: invoice.customerId || invoice.customerName,
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
              accountCode: '440-0001',
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
            manager,
          );
        } catch (error) {
          this.logger.error(`Error contabilización venta ${invoice.id}: ${error.message}`);
          throw error;
        }
      }

      // ── Cuenta por Cobrar automática ──
      const arNumber = await this.sequenceService.nextFormatted(
        companyId,
        'account-receivable',
        'CC',
        { year: invoiceYear, padding: 4, includeYear: true, manager },
      );

      let customerNit: string | null = null;
      if (invoice.customerId) {
        const customer = await manager.getRepository(Customer).findOne({
          where: { id: invoice.customerId, companyId },
        });
        customerNit = customer?.taxId || null;
      }

      const accountReceivable = await manager.getRepository(AccountReceivable).save(
        this.arRepo.create({
          arNumber,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          customerId: invoice.customerId || null,
          customerAddress: invoice.customerAddress || null,
          customerPhone: invoice.customerPhone || null,
          customerEmail: null,
          customerNit,
          originalAmount: Number(invoice.total),
          balanceAmount: Number(invoice.total),
          paidAmount: 0,
          dueDate: new Date(new Date(invoice.date).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
    });

    return result;
  }

  private static readonly EDITABLE_FIELDS = [
    'notes',
    'customerAddress',
    'customerPhone',
    'dueDate',
  ];

  async update(companyId: number, id: string, data: Record<string, any>) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!invoice) throw new NotFoundException(`Factura #${id} no encontrada`);

    if (invoice.status === 'cancelled') {
      throw new BadRequestException('No se puede modificar una factura anulada');
    }

    const rejected = Object.keys(data).filter(
      (key) => !InvoicesService.EDITABLE_FIELDS.includes(key),
    );
    if (rejected.length > 0) {
      throw new BadRequestException(
        `No se pueden modificar los campos [${rejected.join(', ')}] de una factura emitida, ` +
          `porque alterarían el asiento contable, el impuesto declarado y la cuenta por cobrar. ` +
          `Anule la factura y emita una nueva. Campos editables: ${InvoicesService.EDITABLE_FIELDS.join(', ')}.`,
      );
    }

    for (const field of InvoicesService.EDITABLE_FIELDS) {
      if (field in data) invoice[field] = data[field];
    }

    const saved = await this.invoiceRepo.save(invoice);
    return { invoice: saved };
  }

  async remove(companyId: number, id: string) {
    const invoice = await this.invoiceRepo.findOneBy({ id, companyId });
    if (!invoice) throw new NotFoundException(`Factura #${id} no encontrada`);

    if (invoice.status !== 'cancelled') {
      throw new BadRequestException(
        `La factura ${invoice.invoiceNumber} debe anularse antes de eliminarse, ` +
          `de modo que se generen el asiento de reverso y la devolución al inventario.`,
      );
    }

    await this.invoiceRepo.softRemove(invoice);
    return { message: 'Factura eliminada correctamente' };
  }

  async updateStatus(
    companyId: number,
    id: string,
    status: string,
    options?: {
      paymentMethod?: string;
      bankAccountId?: string;
      paymentDate?: string;
      performedBy?: string;
      reason?: string;
    },
  ) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!invoice) throw new NotFoundException(`Factura #${id} no encontrada`);

    const prevStatus = invoice.status;
    if (prevStatus === status) {
      return { invoice };
    }

    if (prevStatus === 'cancelled') {
      throw new BadRequestException(
        `La factura ${invoice.invoiceNumber} está anulada y no admite cambios de estado`,
      );
    }

    // ── COBRO (delegado a Finanzas) ──
    if (status === 'paid') {
      return this.registerCollection(companyId, invoice, options);
    }

    // ── ANULACIÓN ──
    if (status === 'cancelled') {
      await this.dataSource.transaction(async (manager) => {
        await this.reverseInvoice(companyId, invoice, options, manager);
        invoice.status = status;
        await manager.getRepository(Invoice).save(invoice);
      });
      return { invoice };
    }

    invoice.status = status;
    const saved = await this.invoiceRepo.save(invoice);
    return { invoice: saved };
  }

  private async registerCollection(
    companyId: number,
    invoice: Invoice,
    options?: {
      paymentMethod?: string;
      bankAccountId?: string;
      paymentDate?: string;
      performedBy?: string;
    },
  ) {
    const ar = await this.arRepo.findOne({
      where: { invoiceId: invoice.id, companyId },
    });

    if (!ar) {
      throw new BadRequestException(
        `La factura ${invoice.invoiceNumber} no tiene cuenta por cobrar asociada. ` +
          `Registre el cobro desde el módulo de Finanzas.`,
      );
    }

    const pending = Number(ar.balanceAmount);
    if (pending <= 0) {
      invoice.status = 'paid';
      const saved = await this.invoiceRepo.save(invoice);
      return { invoice: saved };
    }

    await this.financeService.createPayment(companyId, {
      paymentType: 'receivable',
      accountReceivableId: ar.id,
      amount: pending,
      paymentDate: options?.paymentDate || new Date().toISOString().split('T')[0],
      paymentMethod: options?.paymentMethod || 'cash',
      bankAccountId: options?.bankAccountId,
      currency: 'CUP',
      exchangeRate: 1,
      description: `Cobro factura ${invoice.invoiceNumber}`,
      counterpartyName: invoice.customerName,
      performedBy: options?.performedBy || 'Sistema',
    });

    const refreshed = await this.invoiceRepo.findOne({
      where: { id: invoice.id, companyId },
      relations: ['items'],
    });
    return { invoice: refreshed || invoice };
  }

  private async reverseInvoice(
    companyId: number,
    invoice: Invoice,
    options?: { reason?: string; performedBy?: string },
    manager?: any,
  ) {
    const mgr = manager || this.dataSource.manager;
    const reversalDate = new Date().toISOString().split('T')[0];

    const ar = await mgr.getRepository(AccountReceivable).findOne({
      where: { invoiceId: invoice.id, companyId },
    });
    if (ar && Number(ar.paidAmount) > 0) {
      throw new BadRequestException(
        `No se puede anular la factura ${invoice.invoiceNumber}: tiene cobros registrados por ` +
          `${Number(ar.paidAmount).toFixed(2)}. Revierta primero los cobros en Finanzas.`,
      );
    }

    // ── 1. Devolución al inventario + reverso del costo (delegado a Inventario) ──
    const originalMovements = await mgr.getRepository(Movement).find({
      where: {
        companyId,
        movementType: 'exit',
        reason: `Factura ${invoice.invoiceNumber}`,
      },
    });

    if (originalMovements.length) {
      await this.movementsService.registerSaleReturn(
        companyId,
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          originalMovementIds: originalMovements.map((m: any) => m.id),
          userName: options?.performedBy,
        },
        mgr,
      );
    }

    // ── 2. Reverso del asiento de VENTA (135 H / 900 D + 440-0001 D) ──
    const salesAccount =
      (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_SALE)) || '900';
    const receivableAccount =
      (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_RECEIVABLE)) || '135';

    const total = Number(invoice.total || 0);
    const taxAmount = Number(invoice.taxAmount || 0);
    const taxable = Math.round((total - taxAmount) * 100) / 100;

    if (total > 0) {
      try {
        const reversalLines: any[] = [
          {
            accountCode: salesAccount,
            debit: taxable,
            credit: 0,
            description: `Reverso venta ${invoice.invoiceNumber}`,
          },
        ];

        if (taxAmount > 0) {
          reversalLines.push({
            accountCode: '440-0001',
            debit: taxAmount,
            credit: 0,
            description: `Reverso Impuesto sobre Ventas ${invoice.invoiceNumber}`,
          });
        }

        reversalLines.push({
          accountCode: receivableAccount,
          debit: 0,
          credit: total,
          description: `Reverso CxC ${invoice.invoiceNumber}`,
          reference: invoice.customerId || invoice.customerName,
        });

        await this.voucherService.createVoucherFromModule(
          companyId,
          'invoices',
          `${invoice.id}-reversal`,
          {
            date: reversalDate,
            description: `Anulación factura ${invoice.invoiceNumber}${options?.reason ? ` - ${options.reason}` : ''}`,
            type: 'nota_credito',
            reference: `CANCEL-${invoice.invoiceNumber}`,
            createdBy: options?.performedBy || 'Sistema',
            lines: reversalLines,
          },
          manager,
        );
      } catch (error) {
        this.logger.error(`Error contabilización cancelación ${invoice.id}: ${error.message}`);
        throw error;
      }
    }

    // ── 3. Cancelación de la cuenta por cobrar ──
    if (ar && ar.status !== 'written_off') {
      ar.balanceAmount = 0;
      ar.status = 'written_off';
      ar.writtenOffDate = reversalDate;
      ar.writtenOffReason = `Anulación de la factura ${invoice.invoiceNumber}${options?.reason ? `: ${options.reason}` : ''}`;
      await mgr.getRepository(AccountReceivable).save(ar);
    }

    if (options?.reason) {
      invoice.notes = `${invoice.notes ? `${invoice.notes} | ` : ''}Anulada: ${options.reason}`;
    }
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
