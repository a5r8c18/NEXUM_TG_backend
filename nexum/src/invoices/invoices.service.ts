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
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';
import { FinanceService } from '../finance/finance.service';
import {
  PaginationDto,
  PaginationResult,
} from '../common/pagination/pagination.dto';
import { getMovementType } from '../movements/movement-types.catalog';

/**
 * Códigos de movimiento de salida por venta según el catalogo cubano.
 * La devolución (anulación de la factura) usa el código de entrada recíproco
 * "Devolución de ventas" (106/107 insumo, 206/207 mercancía, 306/307 producción).
 */
const SALE_MOVEMENT_CODES: Record<
  string,
  { client: string; worker: string; returnClient: string; returnWorker: string }
> = {
  // El nomenclador de movimientos no prevé venta de insumos a clientes: la
  // salida se registra con el código 1101 y la devolución con el 106/107.
  insumo: {
    client: '1101',
    worker: '1101',
    returnClient: '107',
    returnWorker: '106',
  },
  mercancia: {
    client: '2100',
    worker: '2101',
    returnClient: '207',
    returnWorker: '206',
  },
  produccion: {
    client: '3100',
    worker: '3101',
    returnClient: '307',
    returnWorker: '306',
  },
};

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
    private readonly sequenceService: DocumentSequenceService,
    @Inject(forwardRef(() => FinanceService))
    private readonly financeService: FinanceService,
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
      /**
       * Destinatario de la venta. Determina el código de movimiento cubano:
       * 'client' → 2100/3100 (ventas a clientes);
       * 'worker' → 1101/2101/3101 (ventas a trabajadores).
       */
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

    // Warehouse from the invoice payload (or first available warehouse as fallback)
    const invoiceWarehouseId = data['warehouseId'];

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

    const now = new Date().toISOString();
    const invoiceDate = data.date || now.split('T')[0];
    const invoiceYear = new Date(invoiceDate).getFullYear();
    // Consecutivo atómico por empresa y año: garantiza numeración única e
    // ininterrumpida aunque existan facturas anuladas o peticiones simultáneas.
    const invoiceNumber = await this.sequenceService.nextFormatted(
      companyId,
      'invoice',
      'INV',
      { year: invoiceYear, padding: 4, includeYear: true },
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

    const invoice = await this.invoiceRepo.save(
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
    // Costo de cada línea, capturado ANTES de descontar el inventario: si la
    // venta agota las existencias, el promedio ponderado posterior sería 0 y el
    // costo de ventas quedaría subvalorado (NCC 3).
    const itemCosts = new Map<string, { unitCost: number; totalCost: number }>();

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
          const inventory = (invoiceWarehouseId
            ? inventories.find(i => i.warehouseId === invoiceWarehouseId)
            : inventories[0]) || inventories[0];
          if (!inventory) continue;

          // Código de movimiento según categoría y destinatario de la venta
          const category = product?.category || 'mercancia';
          const codes = SALE_MOVEMENT_CODES[category] || SALE_MOVEMENT_CODES.mercancia;
          const movCode = saleType === 'worker' ? codes.worker : codes.client;

          // Costo promedio ponderado por almacén ANTES de la salida (INV-08)
          const unitCost = Number(inventory?.unitPrice || 0);
          const totalCost = Math.round(unitCost * item.quantity * 100) / 100;
          const previous = itemCosts.get(item.productCode);
          itemCosts.set(item.productCode, {
            unitCost,
            totalCost: (previous?.totalCost || 0) + totalCost,
          });

          // Actualizar stock
          await this.inventoryWarehouseService.updateStock(
            companyId,
            item.productCode,
            inventory.warehouseId,
            item.quantity,
            'exit',
          );

          // Crear movimiento con código cubano.
          // El submayor de inventario se valora SIEMPRE a costo, nunca a precio
          // de venta, para que coincida con el asiento de costo de ventas.
          const movType = getMovementType(movCode);
          await this.movementRepo.save(
            this.movementRepo.create({
              companyId,
              movementType: 'exit',
              movementCode: movCode,
              movementDescription: movType?.description || 'Ventas a Clientes',
              category,
              productCode: item.productCode,
              quantity: item.quantity,
              unitPrice: unitCost,
              totalAmount: totalCost,
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
            // Submayor por tercero: identificación fiscal del cliente
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

        // 2. Contabilizar costo de ventas con el costo capturado ANTES de la
        //    salida de inventario (ver itemCosts).
        let costOfSales = 0;
        const costLines: any[] = [];

        const costOfSalesAccount =
          (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_EXIT)) || '810';
        const inventoryAccount =
          (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_ENTRY)) || '189';

        for (const [productCode, cost] of itemCosts.entries()) {
          if (cost.totalCost <= 0) continue;
          costOfSales += cost.totalCost;

          costLines.push({
            accountCode: costOfSalesAccount,
            debit: cost.totalCost,
            credit: 0,
            description: `Costo venta ${productCode} (CPP: ${cost.unitCost})`,
          });

          costLines.push({
            accountCode: inventoryAccount,
            debit: 0,
            credit: cost.totalCost,
            description: `Salida inventario ${productCode} (CPP: ${cost.unitCost})`,
          });
        }
        costOfSales = Math.round(costOfSales * 100) / 100;

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
        // Un error en la contabilización del costo de ventas o en el movimiento
        // de inventario no debe dejar la factura creada de forma inconsistente.
        throw error;
      }
    }

    // Crear AccountReceivable automáticamente
    const arNumber = await this.sequenceService.nextFormatted(
      companyId,
      'account-receivable',
      'CC',
      { year: invoiceYear, padding: 4, includeYear: true },
    );

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
        // NIT del cliente: imprescindible para el submayor por tercero
        customerNit: invoice.customerId || null,
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

  /**
   * Campos editables de una factura ya emitida.
   *
   * Los importes, el cliente y la fecha determinan el asiento contable, el
   * impuesto declarado y la cuenta por cobrar: modificarlos después de emitir
   * la factura dejaría la contabilidad descuadrada. Para cambiarlos debe
   * anularse la factura y emitirse una nueva.
   */
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
      throw new BadRequestException(
        'No se puede modificar una factura anulada',
      );
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

    // Una factura contabilizada no se elimina: se anula, para que queden el
    // asiento de reverso, la devolución de inventario y la cancelación de la
    // cuenta por cobrar.
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
      /** Método de cobro cuando se marca la factura como pagada */
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

    // ── COBRO ────────────────────────────────────────────────────────────
    // El cobro es competencia exclusiva del módulo de Finanzas: allí se
    // registra el Payment, se actualiza la cuenta por cobrar, el saldo de
    // caja/banco y se emite el ÚNICO comprobante contable del cobro.
    // Marcar la factura como pagada desde aquí generaría un segundo asiento
    // por el mismo hecho económico.
    if (status === 'paid') {
      return this.registerCollection(companyId, invoice, options);
    }

    // ── ANULACIÓN ────────────────────────────────────────────────────────
    if (status === 'cancelled') {
      await this.reverseInvoice(companyId, invoice, options);
    }

    invoice.status = status;
    const saved = await this.invoiceRepo.save(invoice);
    return { invoice: saved };
  }

  /**
   * Registra el cobro total pendiente de la factura a través de Finanzas.
   * Delegar aquí evita la doble contabilización del efectivo y de la CxC.
   */
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
      // La CxC ya está saldada: solo se sincroniza el estado del documento.
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

  /**
   * Anula la factura revirtiendo íntegramente sus efectos:
   *  1. Devolución al inventario con el código cubano de devolución de ventas
   *     (106/107 insumo, 206/207 mercancía, 306/307 producción), valorada al
   *     mismo costo con que salió.
   *  2. Reverso del asiento de costo de ventas (inventario D / costo H).
   *  3. Reverso EXACTO del asiento de venta, incluida la cancelación del
   *     Impuesto sobre Ventas devengado (440-0001).
   *  4. Cancelación de la cuenta por cobrar.
   */
  private async reverseInvoice(
    companyId: number,
    invoice: Invoice,
    options?: { reason?: string; performedBy?: string },
  ) {
    const reversalDate = new Date().toISOString().split('T')[0];

    const ar = await this.arRepo.findOne({
      where: { invoiceId: invoice.id, companyId },
    });
    if (ar && Number(ar.paidAmount) > 0) {
      throw new BadRequestException(
        `No se puede anular la factura ${invoice.invoiceNumber}: tiene cobros registrados por ` +
          `${Number(ar.paidAmount).toFixed(2)}. Revierta primero los cobros en Finanzas.`,
      );
    }

    // 1. Devolución al inventario, reutilizando los movimientos de salida
    //    originales para recuperar el almacén y el costo con que salió.
    const originalMovements = await this.movementRepo.find({
      where: {
        companyId,
        movementType: 'exit',
        reason: `Factura ${invoice.invoiceNumber}`,
      },
    });

    let totalCostReversal = 0;

    for (const movement of originalMovements) {
      if (!movement.productCode) continue;
      const quantity = Number(movement.quantity) || 0;
      const unitCost = Number(movement.unitPrice) || 0;
      const lineCost = Math.round(unitCost * quantity * 100) / 100;
      totalCostReversal += lineCost;

      const category = movement.category || 'mercancia';
      const codes = SALE_MOVEMENT_CODES[category] || SALE_MOVEMENT_CODES.mercancia;
      // 1101/2101/3101 son ventas a trabajadores → devolución 106/206/306.
      const isWorkerSale = ['1101', '2101', '3101'].includes(
        movement.movementCode || '',
      );
      const returnCode = isWorkerSale ? codes.returnWorker : codes.returnClient;
      const returnType = getMovementType(returnCode);

      try {
        const warehouseId =
          movement.sourceWarehouse ||
          (await this.inventoryWarehouseService.findByCode(
            companyId,
            movement.productCode,
          ))[0]?.warehouseId;

        if (warehouseId) {
          // Se reingresa al mismo costo de salida para no alterar el promedio
          // ponderado del almacén.
          await this.inventoryWarehouseService.updateStock(
            companyId,
            movement.productCode,
            warehouseId,
            quantity,
            'entry',
            unitCost,
          );
        }

        await this.movementRepo.save(
          this.movementRepo.create({
            companyId,
            movementType: 'entry',
            movementCode: returnCode,
            movementDescription:
              returnType?.description || 'Devolución de ventas',
            category,
            productCode: movement.productCode,
            quantity,
            unitPrice: unitCost,
            totalAmount: lineCost,
            reason: `Anulación factura ${invoice.invoiceNumber}`,
            destinationWarehouse: movement.sourceWarehouse || null,
            userName: options?.performedBy || 'Sistema',
          }),
        );
      } catch (error) {
        this.logger.error(
          `Error devolviendo inventario de ${movement.productCode} al anular ${invoice.invoiceNumber}: ${error.message}`,
        );
      }
    }

    totalCostReversal = Math.round(totalCostReversal * 100) / 100;

    const salesAccount =
      (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_SALE)) || '900';
    const receivableAccount =
      (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_RECEIVABLE)) || '135';
    const costOfSalesAccount =
      (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_EXIT)) || '810';
    const inventoryAccount =
      (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_ENTRY)) || '189';

    // 2. Reverso del costo de ventas
    if (totalCostReversal > 0) {
      try {
        await this.voucherService.createVoucherFromModule(
          companyId,
          'invoices',
          `${invoice.id}-cost-reversal`,
          {
            date: reversalDate,
            description: `Reverso costo de ventas - Anulación factura ${invoice.invoiceNumber}`,
            type: 'nota_credito',
            reference: `REV-COST-${invoice.invoiceNumber}`,
            createdBy: options?.performedBy || 'Sistema',
            lines: [
              {
                accountCode: inventoryAccount,
                debit: totalCostReversal,
                credit: 0,
                description: `Reingreso inventario por anulación ${invoice.invoiceNumber}`,
              },
              {
                accountCode: costOfSalesAccount,
                debit: 0,
                credit: totalCostReversal,
                description: `Reverso costo de ventas ${invoice.invoiceNumber}`,
              },
            ],
          },
        );
      } catch (error) {
        this.logger.error(
          `Error reverso costo de ventas ${invoice.id}: ${error.message}`,
        );
        throw error;
      }
    }

    // 3. Reverso exacto del asiento de venta: base imponible e impuesto por
    //    separado, tal como se devengaron.
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
            accountCode: '440-0001', // Impuesto sobre Ventas
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
        );
      } catch (error) {
        this.logger.error(
          `Error contabilización cancelación ${invoice.id}: ${error.message}`,
        );
        throw error;
      }
    }

    // 4. Cancelación de la cuenta por cobrar
    if (ar && ar.status !== 'written_off') {
      ar.balanceAmount = 0;
      ar.status = 'written_off';
      ar.writtenOffDate = reversalDate;
      ar.writtenOffReason = `Anulación de la factura ${invoice.invoiceNumber}${options?.reason ? `: ${options.reason}` : ''}`;
      await this.arRepo.save(ar);
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
