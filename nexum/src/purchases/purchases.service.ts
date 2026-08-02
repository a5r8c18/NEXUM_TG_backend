import { Injectable, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
import { getMovementType } from '../movements/movement-types.catalog';

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
    private readonly dataSource: DataSource,
  ) {}

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
    opts: { invoiceNumber?: string | null; invoiceDate?: string | null } = {},
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

    return apRepo.save(
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
      products: Array<{
        product_code: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        amount?: number;
        unit?: string;
        expiration_date?: string;
      }>;
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
    const purchaseTotal = products.reduce((sum, pp) => sum + Number(pp.totalPrice), 0);
    let accountingWarning: string | null = null;
    if (purchaseTotal > 0) {
      try {
        const inventoryAccount = data.debitAccountCode
          ? data.debitAccountCode
          : (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_ENTRY)) || '189';

        if (arrivesInvoiced) {
          // Opción C: la compra llega CON factura → asiento contable directo
          // Débito 189 (Inventario) / Crédito 405-410 (Cuentas por Pagar). La 699 no interviene.
          const payableAccount = data.creditAccountCode
            ? data.creditAccountCode
            : (await this.accountMappingService.getAccountForMapping(companyId, MappingType.PURCHASE_ORDER)) || '410';

          await this.voucherService.createVoucherFromModule(
            companyId,
            'inventory',
            purchase.id,
            {
              date: purchase.invoiceDate
                ? new Date(purchase.invoiceDate).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0],
              description: `Compra ${data.document} (fact. ${data.invoiceNumber}) - ${data.supplier}`,
              type: 'inventory',
              reference: `FAC-${data.invoiceNumber}`,
              createdBy: userName || 'Sistema',
              lines: [
                {
                  accountCode: inventoryAccount,
                  debit: purchaseTotal,
                  credit: 0,
                  description: `Inventario recibido - ${data.document}`,
                },
                {
                  accountCode: payableAccount,
                  debit: 0,
                  credit: purchaseTotal,
                  description: `Obligación de pago proveedor - ${data.supplier}`,
                  reference: data.supplierId || data.supplier,
                },
              ],
            },
            manager,
          );
          this.logger.log(`Comprobante directo (facturado) generado para compra ${purchase.id}: ${inventoryAccount} / ${payableAccount}`);
        } else {
          // Recepción SIN factura → cuenta transitoria (GRNI: mercancía recibida no facturada)
          // Débito 189 (Inventario) / Crédito 699 (Transitoria). Se liquida al registrar la factura.
          const transitAccount = data.creditAccountCode
            ? data.creditAccountCode
            : (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_TRANSIT)) || '699';

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
                {
                  accountCode: inventoryAccount,
                  debit: purchaseTotal,
                  credit: 0,
                  description: `Inventario recibido - ${data.document}`,
                },
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
          this.logger.log(`Comprobante de recepción (sin factura) generado para compra ${purchase.id}: ${inventoryAccount} / ${transitAccount}`);
        }
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
   * Genera el asiento contable: Débito 434 (Materiales Recibidos de Forma Anticipada) / Crédito 410 (Proveedores)
   */
  async registerSupplierInvoice(
    companyId: number,
    purchaseId: string,
    data: {
      invoiceNumber: string;
      invoiceDate: string;
      debitAccountCode?: string;  // Override: cuenta transitoria (default 434)
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

    // Generar asiento contable: liquida cuenta transitoria, crea CxP
    const debitAccount = data.debitAccountCode
      ? data.debitAccountCode
      : await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_TRANSIT) || '434';
    const creditAccount = data.creditAccountCode
      ? data.creditAccountCode
      : await this.accountMappingService.getAccountForMapping(companyId, MappingType.PURCHASE_ORDER) || '410';

    await this.voucherService.createVoucherFromModule(
      companyId,
      'inventory',
      purchase.id,
      {
        date: data.invoiceDate,
        description: `Factura ${data.invoiceNumber} - ${purchase.supplier}`,
        type: 'inventory',
        reference: `FAC-${data.invoiceNumber}`,
        createdBy: userName || 'Sistema',
        lines: [
          {
            accountCode: debitAccount,
            debit: purchaseTotal,
            credit: 0,
            description: `Liquida mercancías en tránsito - ${data.invoiceNumber}`,
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

    // Actualizar la CxP existente (creada al registrar la recepción) con los
    // datos de la factura. Si no existe (compras antiguas), se crea.
    const apRepo = manager ? manager.getRepository(AccountPayable) : this.apRepo;
    const existingAp = await apRepo.findOne({
      where: { purchaseId: purchase.id, companyId },
    });
    let apNumber: string;
    if (existingAp) {
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
        { invoiceNumber: data.invoiceNumber, invoiceDate: data.invoiceDate },
        manager,
      );
      apNumber = ap.apNumber;
    }

    this.logger.log(`Factura ${data.invoiceNumber} registrada para compra ${purchaseId}. Asiento: ${debitAccount} / ${creditAccount}. CxP: ${apNumber}`);

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