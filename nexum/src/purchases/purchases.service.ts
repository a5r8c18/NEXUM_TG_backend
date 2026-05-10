import { Injectable, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { VoucherService } from '../accounting/voucher.service';
import { Purchase } from '../entities/purchase.entity';
import { PurchaseProduct } from '../entities/purchase-product.entity';
import { Movement } from '../entities/movement.entity';
import { ReceptionReport } from '../entities/reception-report.entity';
import { getMovementType } from '../movements/movement-types.catalog';

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private readonly inventoryService: InventoryService,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
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

  async create(
    companyId: number,
    data: {
      entity: string;
      warehouse: string;
      supplier: string;
      document: string;
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
      await this.inventoryService.ensureProduct(companyId, {
        productCode: p.product_code,
        productName: p.product_name,
        productUnit: p.unit,
        unitPrice: p.unit_price,
        warehouse: data.warehouse,
        entity: data.entity,
      });

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
        }),
      );
      products.push(pp);

      await this.inventoryService.updateStock(
        companyId,
        p.product_code,
        p.quantity,
        'entry',
      );

      // Código de movimiento: 102 (Insumo) o 202 (Mercancía) según categoría
      const movCode = '202'; // Default: Compra mercancía (EMP)
      const movType = getMovementType(movCode);
      await this.movementRepo.save(
        this.movementRepo.create({
          companyId,
          movementType: 'entry',
          movementCode: movCode,
          movementDescription: movType?.description || 'Compras a proveedores (EMP)',
          category: 'mercancia',
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

    await this.rrRepo.save(
      this.rrRepo.create({
        purchaseId: purchase.id,
        companyId,
        details: JSON.stringify({
          entity: data.entity,
          warehouse: data.warehouse,
          supplier: data.supplier,
          document: data.document,
          documentType: 'Factura',
          complies: true,
          products: productsJson,
        }),
        createdByName: userName || 'System',
      }),
    );

    // ── Contabilización automática de compra ──
    const purchaseTotal = products.reduce((sum, pp) => sum + Number(pp.totalPrice), 0);
    if (purchaseTotal > 0) {
      try {
        await this.voucherService.createVoucherFromModule(
          companyId,
          'inventory',
          purchase.id,
          {
            date: new Date().toISOString().split('T')[0],
            description: `Compra ${data.document} - ${data.supplier}`,
            type: 'inventory',
            reference: `COMPRA-${purchase.id.substring(0, 8)}`,
            createdBy: userName || 'Sistema',
            lines: [
              {
                accountCode: '189', // Mercancías para la Venta
                debit: purchaseTotal,
                credit: 0,
                description: `Compra mercancías - ${data.document}`,
              },
              {
                accountCode: '410', // Cuentas por Pagar a Proveedores
                debit: 0,
                credit: purchaseTotal,
                description: `Obligación proveedor ${data.supplier}`,
              },
            ],
          },
        );
        this.logger.log(`Comprobante contable generado para compra ${purchase.id}`);
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
