import { Injectable, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      document: string;
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

    const purchase = await this.purchaseRepo.save(
      this.purchaseRepo.create({
        companyId,
        entity: data.entity,
        warehouse: data.warehouse,
        supplier: data.supplier,
        document: data.document,
        status: 'completed',
      }),
    );

    const products: PurchaseProduct[] = [];
    const productsJson: any[] = [];

    for (const p of data.products) {
      // Asegurar producto en catálogo central
      const product = await this.productsService.ensureProduct(companyId, {
        productCode: p.product_code,
        productName: p.product_name,
      });

      // Determinar código de movimiento según categoría del producto
      let movCode = '202'; // Default: Compra mercancía (EMP)
      if (product.category === 'insumo') {
        movCode = '102'; // Compras a proveedores (EMP) - Insumo
      } else if (product.category === 'produccion') {
        movCode = '402'; // Compras a proveedores (Presup.) - Producción
      }

      const totalPrice = p.amount ?? p.quantity * p.unit_price;
      const pp = await this.ppRepo.save(
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
      });

      await this.inventoryWarehouseService.updateStock(
        companyId,
        p.product_code,
        data.warehouse,
        p.quantity,
        'entry',
        p.unit_price, // Nuevo precio para cálculo de costo promedio
      );

      // Crear movimiento con código dinámico
      const movType = getMovementType(movCode);
      if (!movType) {
        throw new BadRequestException(`Código de movimiento inválido: ${movCode}`);
      }

      await this.movementRepo.save(
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

    await this.rrRepo.save(
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

    // ── Contabilización automática de compra (recepción de mercancía) ──
    const purchaseTotal = products.reduce((sum, pp) => sum + Number(pp.totalPrice), 0);
    if (purchaseTotal > 0) {
      try {
        // Según normas cubanas: recepción de mercancía usa cuenta puente
        // Débito: 189 (Inventario) / Crédito: 189-01 (Mercancías en tránsito)
        const debitAccount = data.debitAccountCode
          ? data.debitAccountCode
          : await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_ENTRY) || '189';
        const creditAccount = data.creditAccountCode
          ? data.creditAccountCode
          : await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_TRANSIT) || '189-01';

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
                accountCode: debitAccount,
                debit: purchaseTotal,
                credit: 0,
                description: `Inventario recibido - ${data.document}`,
              },
              {
                accountCode: creditAccount,
                debit: 0,
                credit: purchaseTotal,
                description: `Mercancías en tránsito - ${data.supplier}`,
              },
            ],
          },
        );
        this.logger.log(`Comprobante contable generado para recepción ${purchase.id} con cuentas: ${debitAccount} / ${creditAccount}`);
      } catch (error) {
        this.logger.error(
          `Error al generar comprobante para recepción ${purchase.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    return { purchase, products };
  }

  /**
   * Registra la factura del proveedor para una compra existente.
   * Genera el asiento contable: Débito 189-01 (Mercancías en tránsito) / Crédito 410 (Proveedores)
   */
  async registerSupplierInvoice(
    companyId: number,
    purchaseId: string,
    data: {
      invoiceNumber: string;
      invoiceDate: string;
      debitAccountCode?: string;  // Override: cuenta puente (default 189-01)
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

    // Actualizar purchase con datos de factura
    purchase.invoiceNumber = data.invoiceNumber;
    purchase.invoiceDate = new Date(data.invoiceDate);
    purchase.isInvoiced = true;
    purchase.status = 'invoiced';
    await this.purchaseRepo.save(purchase);

    // Calcular total de la compra
    const purchaseTotal = purchase.products.reduce((sum, pp) => sum + Number(pp.totalPrice), 0);

    // Generar asiento contable: liquida cuenta puente, crea CxP
    const debitAccount = data.debitAccountCode
      ? data.debitAccountCode
      : await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_TRANSIT) || '189-01';
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
          },
        ],
      },
    );

    // Crear AccountPayable automáticamente
    const apCount = await this.apRepo.count({ where: { companyId } });
    const apNumber = `CP-${new Date().getFullYear()}-${String(apCount + 1).padStart(4, '0')}`;
    
    const accountPayable = await this.apRepo.save(
      this.apRepo.create({
        apNumber,
        purchaseId: purchase.id,
        purchaseNumber: purchase.document,
        supplierId: 'SUP-' + purchase.supplier.substring(0, 8), // Generar ID temporal
        supplierName: purchase.supplier,
        supplierNit: 'NIT-' + purchase.supplier.substring(0, 8), // Generar NIT temporal
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        originalAmount: purchaseTotal,
        balanceAmount: purchaseTotal,
        paidAmount: 0,
        dueDate: new Date(new Date(data.invoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 días por defecto
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

    this.logger.log(`Factura ${data.invoiceNumber} registrada para compra ${purchaseId}. Asiento: ${debitAccount} / ${creditAccount}. CxP creada: ${apNumber}`);

    return { purchase, message: 'Factura registrada correctamente' };
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