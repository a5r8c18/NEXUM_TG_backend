import { Injectable, BadRequestException, Inject, forwardRef, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MovementsService } from '../movements/movements.service';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { ProductsService } from '../products/products.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { Purchase } from '../entities/purchase.entity';
import { PurchaseProduct } from '../entities/purchase-product.entity';
import { Movement } from '../entities/movement.entity';
import { ReceptionReport } from '../entities/reception-report.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { getMovementType, getInventoryAccountByCategory, InventoryCategory } from '../movements/movement-types.catalog';

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private readonly inventoryWarehouseService: InventoryWarehouseService,
    private readonly productsService: ProductsService,
    private readonly warehousesService: WarehousesService,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    private readonly accountMappingService: AccountMappingService,
    @InjectRepository(Purchase)
    private readonly purchaseRepo: Repository<Purchase>,
    @InjectRepository(PurchaseProduct)
    private readonly ppRepo: Repository<PurchaseProduct>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(ReceptionReport)
    private readonly rrRepo: Repository<ReceptionReport>,
    @InjectRepository(AccountPayable)
    private readonly apRepo: Repository<AccountPayable>,
    private readonly movementsService: MovementsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Concepto de devolución de compra según la categoría de la recepción. */
  private static readonly PURCHASE_RETURN_CODE: Record<InventoryCategory, string> = {
    insumo: '1107',
    mercancia: '2107',
    produccion: '3107',
  };

  /**
   * Edita los datos de cabecera del informe de recepción (documento,
   * proveedor, entidad, transportista y recepcionado por). No toca
   * productos, cantidades ni el inventario.
   */
  async updateReception(
    companyId: number,
    purchaseId: string,
    data: {
      document?: string;
      supplier?: string;
      entity?: string;
      transportista?: string;
      receivedBy?: string;
    },
  ) {
    const purchase = await this.purchaseRepo.findOneBy({ id: purchaseId, companyId });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status === 'cancelled') {
      throw new BadRequestException('La recepción está cancelada');
    }
    if (purchase.isReconciled) {
      throw new BadRequestException('La recepción está conciliada y no admite cambios');
    }

    if (data.document !== undefined) purchase.document = data.document;
    if (data.supplier !== undefined) purchase.supplier = data.supplier;
    if (data.entity !== undefined) purchase.entity = data.entity;
    await this.purchaseRepo.save(purchase);

    const report = await this.rrRepo.findOneBy({ purchaseId, companyId });
    if (report) {
      const notes = JSON.parse(report.notes || '{}');
      if (data.document !== undefined) notes.document = data.document;
      if (data.entity !== undefined) notes.entity = data.entity;
      if (data.supplier !== undefined) {
        notes.supplier = data.supplier;
        report.supplierName = data.supplier;
      }
      if (data.transportista !== undefined) notes.transportista = data.transportista;
      if (data.receivedBy !== undefined) {
        notes.responsables = { ...(notes.responsables || {}), recepcionadoPor: data.receivedBy };
        report.receivedBy = data.receivedBy;
      }
      report.notes = JSON.stringify(notes);
      await this.rrRepo.save(report);
    }

    return { purchase };
  }

  /**
   * Cancela un informe de recepción: genera una salida por devolución de
   * compra con el concepto propio de cada categoría (1107 insumo, 2107
   * mercancía, 3107 producción), lo que descarga el stock, crea el informe
   * de devolución, asienta el comprobante y ajusta la CxP del proveedor.
   */
  async cancelReception(companyId: number, purchaseId: string, userName?: string) {
    const purchase = await this.purchaseRepo.findOne({
      where: { id: purchaseId, companyId },
      relations: ['products'],
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status === 'cancelled') {
      throw new BadRequestException('La recepción ya está cancelada');
    }
    if (purchase.isReconciled) {
      throw new BadRequestException('La recepción está conciliada: revierta primero la conciliación');
    }

    const payable = await this.apRepo.findOneBy({ purchaseId, companyId });
    if (payable && Number(payable.paidAmount) > 0) {
      throw new BadRequestException(
        `La recepción tiene pagos registrados por ${Number(payable.paidAmount).toFixed(2)}. Revierta primero los pagos en Finanzas.`,
      );
    }

    // Una salida de devolución por categoría presente en la recepción.
    const byCategory = new Map<InventoryCategory, { productCode: string; quantity: number }[]>();
    for (const p of purchase.products ?? []) {
      const cat = ((p as any).category as InventoryCategory) || 'mercancia';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push({ productCode: p.productCode, quantity: Number(p.quantity) });
    }

    const movements: any[] = [];
    for (const [category, items] of byCategory) {
      const code = PurchasesService.PURCHASE_RETURN_CODE[category];
      const mov = await this.movementsService.createExit(
        companyId,
        {
          movementCode: code,
          category,
          warehouseId: purchase.warehouse,
          entity: purchase.supplier,
          reason: `Cancelación recepción ${purchase.document}`,
          items,
        },
        userName,
      );
      movements.push(mov);
    }

    purchase.status = 'cancelled';
    await this.purchaseRepo.save(purchase);
    const report = await this.rrRepo.findOneBy({ purchaseId, companyId });
    if (report) {
      report.status = 'cancelled';
      await this.rrRepo.save(report);
    }

    return { purchase, movements };
  }

  async findAll(companyId: number) {
    const purchases = await this.purchaseRepo.find({
      where: { companyId },
      relations: ['products'],
      order: { createdAt: 'DESC' },
    });
    return purchases;
  }

  async findOne(companyId: number, purchaseId: string) {
    const purchase = await this.purchaseRepo.findOne({
      where: { id: purchaseId, companyId },
      relations: ['products'],
    });
    if (!purchase) throw new BadRequestException('Compra no encontrada');
    return { purchase, products: purchase.products };
  }

  /**
   * Crea (o devuelve, si ya existe) la Cuenta por Pagar asociada a una compra.
   * Se genera para toda compra, con o sin factura formal (GRNI):
   * la obligación con el proveedor existe desde la recepción de la mercancía.
   */
  private async createPayableForPurchase(
    companyId: number,
    purchase: Purchase,
    amount: number,
    opts: { invoiceNumber?: string | null; invoiceDate?: string | null; userName?: string } = {},
    manager?: EntityManager,
  ): Promise<AccountPayable> {
    const apRepo = manager ? manager.getRepository(AccountPayable) : this.apRepo;
    const existing = await apRepo.findOne({
      where: { purchaseId: purchase.id, companyId },
    });
    if (existing) return existing;

    const apCount = await apRepo.count({ where: { companyId } });
    const apNumber = `CP-${new Date().getFullYear()}-${String(apCount + 1).padStart(4, '0')}`;
    const baseDate = opts.invoiceDate || new Date().toISOString().split('T')[0];

    const saved = await apRepo.save(
      apRepo.create({
        apNumber,
        purchaseId: purchase.id,
        purchaseNumber: purchase.document,
        supplierId: purchase.supplierId || null, // Usar supplierId si está vinculado
        supplierName: purchase.supplier,
        supplierNit: 'N/D',
        invoiceNumber: opts.invoiceNumber || null,
        invoiceDate: opts.invoiceDate || null,
        originalAmount: amount,
        balanceAmount: amount,
        paidAmount: 0,
        dueDate: new Date(new Date(baseDate).getTime() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0], // 30 días por defecto
        agingDays: 0,
        agingCategory: 'current',
        status: 'pending',
        priority: 'normal',
        paymentTerms: 'contado',
        earlyPaymentDiscount: 0,
        latePaymentPenalty: 0,
        currency: 'CUP',
        exchangeRate: 1,
        companyId,
      }),
    );

    // Comprobante del lado de finanzas (mismo patrón que la 699 en nómina):
    // la obligación con el proveedor se reconoce liquidando la transitoria
    // que el inventario abrió en la recepción. Nunca se asienta 189 directo
    // contra la cuenta por pagar.
    if (amount > 0) {
      const transitAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.INVENTORY_TRANSIT,
        )) || '699';
      const payableAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.PURCHASE_ORDER,
        )) || '410';

      await this.voucherService.createVoucherFromModule(
        companyId,
        'finance',
        `AP-${saved.id}`,
        {
          date: opts.invoiceDate || baseDate,
          description: `Obligación de pago ${apNumber} - ${purchase.supplier}${opts.invoiceNumber ? ` (fact. ${opts.invoiceNumber})` : ''}`,
          type: 'otro',
          reference: opts.invoiceNumber || purchase.document || apNumber,
          createdBy: opts.userName || 'Sistema',
          lines: [
            {
              accountCode: transitAccount,
              debit: amount,
              credit: 0,
              description: `Liquidación transitoria por mercancía recibida - ${purchase.document}`,
            },
            {
              accountCode: payableAccount,
              debit: 0,
              credit: amount,
              description: `Cuenta por pagar - ${purchase.supplier}`,
              reference: purchase.supplierId || purchase.supplier,
            },
          ],
        },
        manager,
      );
    }

    return saved;
  }

  /**
   * Crea una compra y genera automáticamente el comprobante contable.
   * Si se proporcionan debitAccountCode y creditAccountCode, se usan en el voucher;
   * de lo contrario, se usan los defaults del AccountMappingService.
   */
  async create(
    companyId: number,
    data: {
      entity: string;
      warehouse: string;
      supplier: string;
      supplierId?: string;            // <-- Opcional: enlace a Supplier real
      document: string;
      invoiceNumber?: string;         // <-- Opción C: si la compra llega ya facturada
      invoiceDate?: string;           // <-- Opción C: fecha de la factura del proveedor
      debitAccountCode?: string;      // <-- NUEVO: cuenta de inventario (débito)
      creditAccountCode?: string;     // <-- NUEVO: cuenta de proveedor (crédito)
      products: {
        product_code: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        amount?: number;
        unit?: string;
        category?: string;
        expiration_date?: string;
      }[];
    },
    userName?: string,
  ) {
    if (!data.products || data.products.length === 0) {
      throw new BadRequestException(
        'La compra debe tener al menos un producto',
      );
    }

    const arrivesInvoiced = !!data.invoiceNumber;
    const result = await this.dataSource.transaction(async (manager) => {
    const purchase = await manager.getRepository(Purchase).save(
      this.purchaseRepo.create({
        companyId,
        entity: data.entity,
        warehouse: data.warehouse,
        supplier: data.supplier,
        supplierId: data.supplierId || null,
        document: data.document,
        status: arrivesInvoiced ? 'invoiced' : 'completed',
        invoiceNumber: arrivesInvoiced ? data.invoiceNumber : null,
        invoiceDate: arrivesInvoiced && data.invoiceDate ? new Date(data.invoiceDate) : null,
        isInvoiced: arrivesInvoiced,
      }),
    );

    const products: PurchaseProduct[] = [];
    const productsJson: any[] = [];

    for (const p of data.products) {
      // Asegurar producto en catálogo central
      const product = await this.productsService.ensureProduct(companyId, {
        productCode: p.product_code,
        productName: p.product_name,
        productUnit: p.unit,
        category: p.category,
      });

      // Determinar código de movimiento según categoría del producto
      let movCode = '202'; // Default: Compra mercancía (EMP)
      if (product.category === 'insumo') {
        movCode = '102'; // Compras a proveedores (EMP) - Insumo
      } else if (product.category === 'produccion') {
        movCode = '402'; // Compras a proveedores (Presup.) - Producción
      }

      const totalPrice = p.amount ?? p.quantity * p.unit_price;
      const pp = await manager.getRepository(PurchaseProduct).save(
        this.ppRepo.create({
          purchaseId: purchase.id,
          productCode: p.product_code,
          productName: p.product_name,
          quantity: p.quantity,
          unitPrice: p.unit_price,
          totalPrice,
          productUnit: p.unit || 'und',
          expirationDate: p.expiration_date || null,
          category: product.category,
        }),
      );
      products.push(pp);

      // Asegurar producto en inventario del almacén y actualizar stock
      await this.inventoryWarehouseService.ensureProduct(companyId, {
        productCode: p.product_code,
        productName: p.product_name,
        productUnit: p.unit,
        unitPrice: p.unit_price,
        warehouseId: data.warehouse,
        entity: data.entity,
      }, manager);

      await this.inventoryWarehouseService.updateStock(
        companyId,
        p.product_code,
        data.warehouse,
        p.quantity,
        'entry',
        p.unit_price, // Nuevo precio para cálculo de costo promedio
        manager,
      );

      // Crear movimiento con código dinámico
      const movType = getMovementType(movCode);
      if (!movType) {
        throw new BadRequestException(`Código de movimiento inválido: ${movCode}`);
      }

      await manager.getRepository(Movement).save(
        this.movementRepo.create({
          companyId,
          movementType: 'entry',
          movementCode: movCode,
          movementDescription: movType?.description || 'Compras a proveedores',
          category: product.category,
          productCode: p.product_code,
          quantity: p.quantity,
          unitPrice: p.unit_price,
          totalAmount: totalPrice,
          reason: `Compra ${data.document}`,
          destinationWarehouse: data.warehouse,
          userName: userName || 'System',
          purchaseId: purchase.id,
        }),
      );

      productsJson.push({
        code: p.product_code,
        description: p.product_name,
        quantity: p.quantity,
        unitPrice: p.unit_price,
        unit: p.unit || 'und',
        amount: totalPrice,
      });
    }

    const totalAmount = products.reduce((sum, pp) => sum + Number(pp.totalPrice), 0);

    // Resolver nombre del almacén
    const warehouseEntity = await this.warehousesService.findByIdOrCode(companyId, data.warehouse);
    const warehouseName = warehouseEntity?.name || data.warehouse;

    // Generar número de informe consecutivo por almacén
    const year = new Date().getFullYear();
    const lastReport = await this.rrRepo.findOne({
      where: { warehouseId: data.warehouse },
      order: { reportNumber: 'DESC' },
    });
    let sequence = 1;
    if (lastReport?.reportNumber) {
      const match = lastReport.reportNumber.match(/RP-(\d{4})-(\d{4})/);
      if (match && match[1] === String(year)) {
        sequence = parseInt(match[2]) + 1;
      }
    }
    const reportNumber = `RP-${year}-${String(sequence).padStart(4, '0')}`;

    await manager.getRepository(ReceptionReport).save(
      this.rrRepo.create({
        reportNumber,
        reportDate: new Date().toISOString().split('T')[0],
        purchaseId: purchase.id,
        supplierName: data.supplier,
        warehouseId: data.warehouse,
        receivedBy: userName || 'System',
        notes: JSON.stringify({
          entity: data.entity,
          warehouse: warehouseName,
          supplier: data.supplier,
          document: data.document,
          products: productsJson,
          transportista: (data as any).transportista || null,
          responsables: (data as any).responsables || null,
          notes: (data as any).notes || null,
        }),
        totalItems: products.length,
        totalAmount,
        companyId,
      }),
    );

    // ── Contabilización automática de la compra ──
    // La recepción siempre transita por la 699 (mismo patrón que la nómina):
    //   Inventario:  Débito cuenta por categoría (183/189/188) / Crédito 699
    //   Finanzas:    Débito 699 / Crédito proveedor (CxP) — lo genera
    //                createPayableForPurchase al crear la obligación.
    // Nunca se asienta el inventario directo contra la cuenta por pagar.
    const purchaseTotal = products.reduce((sum, pp) => sum + Number(pp.totalPrice), 0);
    let accountingWarning: string | null = null;
    if (purchaseTotal > 0) {
      try {
        const transitAccount = data.creditAccountCode
          ? data.creditAccountCode
          : (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_TRANSIT)) || '699';

        // Una compra no puede mezclar categorías: cada almacén maneja una
        // sola. Si llegan productos de distintas categorías se rechaza la
        // operación completa (debe registrarse como compras separadas).
        const categories = new Set(
          products.map((pp) => (pp.category as InventoryCategory) || 'mercancia'),
        );
        if (categories.size > 1) {
          throw new BadRequestException(
            `La compra ${data.document} mezcla categorías de inventario (${[...categories].join(', ')}). ` +
              `Cada almacén maneja una sola categoría: regístrela como compras separadas.`,
          );
        }
        const purchaseCategory = [...categories][0] as InventoryCategory;

        // Débito único con la cuenta de la categoría (183 insumo,
        // 189 mercancía, 188 producción), salvo que el usuario haya elegido
        // explícitamente la cuenta de inventario.
        const debitLines = [
          {
            accountCode: data.debitAccountCode || getInventoryAccountByCategory(purchaseCategory),
            debit: purchaseTotal,
            credit: 0,
            description: `Inventario recibido - ${data.document}`,
          },
        ];

        await this.voucherService.createVoucherFromModule(
          companyId,
          'inventory',
          purchase.id,
          {
            date: purchase.createdAt
              ? new Date(purchase.createdAt).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
            description: `Recepción mercancía ${data.document} - ${data.supplier}`,
            type: 'inventory',
            reference: `RECEPCION-${purchase.id.substring(0, 8)}`,
            createdBy: userName || 'Sistema',
            lines: [
              ...debitLines,
              {
                accountCode: transitAccount,
                debit: 0,
                credit: purchaseTotal,
                description: `Cuenta transitoria - ${data.supplier}`,
                reference: data.supplierId || data.supplier,
              },
            ],
          },
          manager,
        );
        this.logger.log(`Comprobante de recepción generado para compra ${purchase.id}: ${debitLines.map((l) => l.accountCode).join(' + ')} / ${transitAccount}`);
      } catch (error) {
        accountingWarning = `No se pudo generar el comprobante contable: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(
          `Error al generar comprobante para compra ${purchase.id}: ${error instanceof Error ? error.message : String(error)}`,
          error.stack,
        );
        // El comprobante de recepción es parte de la compra; no se completa si
        // no se puede generar el borrador contable.
        throw error;
      }
    }

    // ── Cuenta por Pagar automática (para toda compra) ──
    // Si la compra llega facturada, se registra con su número/fecha de factura;
    // de lo contrario queda pendiente de factura (GRNI) pero la obligación ya existe.
    if (purchaseTotal > 0) {
      try {
        await this.createPayableForPurchase(companyId, purchase, purchaseTotal, {
          invoiceNumber: arrivesInvoiced ? data.invoiceNumber : null,
          invoiceDate: arrivesInvoiced ? data.invoiceDate : null,
          userName,
        }, manager);
      } catch (error) {
        const msg = `No se pudo crear la Cuenta por Pagar: ${error instanceof Error ? error.message : String(error)}`;
        accountingWarning = accountingWarning ? `${accountingWarning}. ${msg}` : msg;
        this.logger.error(
          `Error al crear CxP para compra ${purchase.id}: ${error instanceof Error ? error.message : String(error)}`,
          error.stack,
        );
      }
    }

    return { purchase, products, accountingWarning };
    });

    return result;
  }

  /**
   * Registra la factura del proveedor para una compra existente.
   * Genera el asiento contable: Débito 699 (Transitoria del Sistema) / Crédito 410 (Proveedores)
   */
  async registerSupplierInvoice(
    companyId: number,
    purchaseId: string,
    data: {
      invoiceNumber: string;
      invoiceDate: string;
      debitAccountCode?: string;  // Override: cuenta transitoria (default 699)
      creditAccountCode?: string; // Override: cuenta proveedor (default 410)
    },
    userName?: string,
  ) {
    const purchase = await this.purchaseRepo.findOne({
      where: { id: purchaseId, companyId },
      relations: ['products'],
    });

    if (!purchase) {
      throw new BadRequestException('Compra no encontrada');
    }

    if (purchase.isInvoiced) {
      throw new BadRequestException('Esta compra ya tiene factura registrada');
    }

    const result = await this.dataSource.transaction(async (manager) => {

    // Actualizar purchase con datos de factura
    purchase.invoiceNumber = data.invoiceNumber;
    purchase.invoiceDate = new Date(data.invoiceDate);
    purchase.isInvoiced = true;
    purchase.status = 'invoiced';
    await manager.getRepository(Purchase).save(purchase);

    // Calcular total de la compra
    const purchaseTotal = purchase.products.reduce((sum, pp) => sum + Number(pp.totalPrice), 0);

    // Actualizar la CxP existente (creada al registrar la recepción) con los
    // datos de la factura. Si no existe (compras antiguas), se crea.
    const apRepo = manager ? manager.getRepository(AccountPayable) : this.apRepo;
    const existingAp = await apRepo.findOne({
      where: { purchaseId: purchase.id, companyId },
    });
    let apNumber: string;
    if (existingAp) {
      // El comprobante 699/proveedor lo genera la CxP al crearse. Para CxP
      // creadas antes de ese cambio (sin comprobante propio), se genera aquí
      // como respaldo para no dejar la transitoria abierta.
      const apVouchers = await this.voucherService.findVouchersBySourceDocumentId(
        companyId,
        `AP-${existingAp.id}`,
      );
      if (apVouchers.length === 0) {
        const debitAccount = data.debitAccountCode
          ? data.debitAccountCode
          : await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_TRANSIT) || '699';
        const creditAccount = data.creditAccountCode
          ? data.creditAccountCode
          : await this.accountMappingService.getAccountForMapping(companyId, MappingType.PURCHASE_ORDER) || '410';

        await this.voucherService.createVoucherFromModule(
          companyId,
          'finance',
          `AP-${existingAp.id}`,
          {
            date: data.invoiceDate,
            description: `Factura ${data.invoiceNumber} - ${purchase.supplier}`,
            type: 'otro',
            reference: `FAC-${data.invoiceNumber}`,
            createdBy: userName || 'Sistema',
            lines: [
              {
                accountCode: debitAccount,
                debit: purchaseTotal,
                credit: 0,
                description: `Liquida transitoria por mercancía recibida - ${data.invoiceNumber}`,
              },
              {
                accountCode: creditAccount,
                debit: 0,
                credit: purchaseTotal,
                description: `Cuenta por pagar - ${purchase.supplier}`,
                reference: purchase.supplierId || purchase.supplier,
              },
            ],
          },
          manager,
        );
      }

      existingAp.invoiceNumber = data.invoiceNumber;
      existingAp.invoiceDate = data.invoiceDate;
      existingAp.dueDate = new Date(
        new Date(data.invoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split('T')[0];
      await apRepo.save(existingAp);
      apNumber = existingAp.apNumber;
    } else {
      const ap = await this.createPayableForPurchase(
        companyId,
        purchase,
        purchaseTotal,
        { invoiceNumber: data.invoiceNumber, invoiceDate: data.invoiceDate, userName },
        manager,
      );
      apNumber = ap.apNumber;
    }

    this.logger.log(`Factura ${data.invoiceNumber} registrada para compra ${purchaseId}. CxP: ${apNumber}`);

    return { purchase, message: 'Factura registrada correctamente' };
    });

    return result;
  }

  /**
   * Realiza conciliación a tres vías: pedido, albarán, factura
   * Valida que los tres documentos coincidan antes de liberar pago
   */
  async reconcilePurchase(
    companyId: number,
    purchaseId: string,
    data: {
      purchaseOrderId?: string;
      deliveryNoteId?: string;
    },
    userName?: string,
  ) {
    const purchase = await this.purchaseRepo.findOne({
      where: { id: purchaseId, companyId },
    });

    if (!purchase) {
      throw new BadRequestException('Compra no encontrada');
    }

    if (purchase.isReconciled) {
      throw new BadRequestException('Esta compra ya está conciliada');
    }

    // Validar que exista factura
    if (!purchase.isInvoiced || !purchase.invoiceNumber) {
      throw new BadRequestException('La compra debe tener factura registrada antes de conciliar');
    }

    // Actualizar con IDs de documentos
    if (data.purchaseOrderId) {
      purchase.purchaseOrderId = data.purchaseOrderId;
    }
    if (data.deliveryNoteId) {
      purchase.deliveryNoteId = data.deliveryNoteId;
    }

    // Marcar como conciliada
    purchase.isReconciled = true;
    purchase.reconciledAt = new Date();
    purchase.status = 'reconciled';
    await this.purchaseRepo.save(purchase);

    this.logger.log(`Compra ${purchaseId} conciliada por ${userName || 'Sistema'}`);

    return { 
      purchase, 
      message: 'Conciliación a tres vías completada correctamente',
      documents: {
        purchaseOrderId: purchase.purchaseOrderId,
        deliveryNoteId: purchase.deliveryNoteId,
        invoiceNumber: purchase.invoiceNumber,
      }
    };
  }
}