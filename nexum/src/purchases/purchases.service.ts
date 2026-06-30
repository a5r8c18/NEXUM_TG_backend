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

    // ── Contabilización automática de compra ──
    const purchaseTotal = products.reduce((sum, pp) => sum + Number(pp.totalPrice), 0);
    if (purchaseTotal > 0) {
      try {
        // Obtener cuentas: si el usuario las proporcionó, usarlas; si no, usar defaults
        const debitAccount = data.debitAccountCode
          ? data.debitAccountCode
          : await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVENTORY_ENTRY) || '189';
        const creditAccount = data.creditAccountCode
          ? data.creditAccountCode
          : await this.accountMappingService.getAccountForMapping(companyId, MappingType.PURCHASE_ORDER) || '410';

        await this.voucherService.createVoucherFromModule(
          companyId,
          'inventory',
          purchase.id,
          {
            date: purchase.createdAt
              ? new Date(purchase.createdAt).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
            description: `Compra ${data.document} - ${data.supplier}`,
            type: 'inventory',
            reference: `COMPRA-${purchase.id.substring(0, 8)}`,
            createdBy: userName || 'Sistema',
            lines: [
              {
                accountCode: debitAccount,
                debit: purchaseTotal,
                credit: 0,
                description: `Compra mercancías - ${data.document}`,
              },
              {
                accountCode: creditAccount,
                debit: 0,
                credit: purchaseTotal,
                description: `Obligación proveedor ${data.supplier}`,
              },
            ],
          },
        );
        this.logger.log(`Comprobante contable generado para compra ${purchase.id} con cuentas: ${debitAccount} / ${creditAccount}`);
      } catch (error) {
        this.logger.error(
          `Error al generar comprobante para compra ${purchase.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    return { purchase, products };
  }
}