import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReceptionReport } from '../entities/reception-report.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import { Inventory } from '../entities/inventory.entity';
import { Movement } from '../entities/movement.entity';
import { MovementItem } from '../entities/movement-item.entity';
import { Purchase } from '../entities/purchase.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ReceptionReport)
    private readonly rrRepo: Repository<ReceptionReport>,
    @InjectRepository(DeliveryReport)
    private readonly drRepo: Repository<DeliveryReport>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(MovementItem)
    private readonly movementItemRepo: Repository<MovementItem>,
    @InjectRepository(Purchase)
    private readonly purchaseRepo: Repository<Purchase>,
  ) {}

  async getReceptionReports(
    companyId: number,
    filters?: {
      fromDate?: string;
      toDate?: string;
      product?: string;
      entity?: string;
      warehouse?: string;
      document?: string;
    },
  ) {
    const reports = await this.rrRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });

    let result = reports.map((r) => {
      const parsed = JSON.parse(r.notes || '{}');
      const createdAtStr =
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt);
      return {
        id: r.id,
        reportNumber: r.reportNumber,
        reportDate: r.reportDate,
        purchaseId: r.purchaseId,
        supplierName: r.supplierName,
        warehouseId: r.warehouseId,
        receivedBy: r.receivedBy,
        entity: parsed.entity,
        warehouse: parsed.warehouse,
        supplier: parsed.supplier,
        document: parsed.document,
        details: {
          products: parsed.products || [],
          totalAmount: Number(r.totalAmount) || 0,
        },
        transportista: parsed.transportista || null,
        responsables: parsed.responsables || {
          recepcionadoPor: r.receivedBy || null,
        },
        totalItems: r.totalItems,
        status: r.status,
        date: createdAtStr.split('T')[0],
        created_at: createdAtStr,
      };
    });

    if (filters?.product) {
      const s = filters.product.toLowerCase();
      result = result.filter((r: any) =>
        r.details?.products?.some(
          (p: any) =>
            p.description?.toLowerCase().includes(s) ||
            p.code?.toLowerCase().includes(s),
        ),
      );
    }
    if (filters?.entity) {
      result = result.filter((r: any) =>
        r.entity?.toLowerCase().includes(filters.entity!.toLowerCase()),
      );
    }
    if (filters?.warehouse) {
      result = result.filter((r: any) =>
        r.warehouse?.toLowerCase().includes(filters.warehouse!.toLowerCase()),
      );
    }
    if (filters?.document) {
      result = result.filter((r: any) =>
        r.document?.toLowerCase().includes(filters.document!.toLowerCase()),
      );
    }
    if (filters?.fromDate) {
      result = result.filter((r: any) => r.date >= filters.fromDate!);
    }
    if (filters?.toDate) {
      result = result.filter((r: any) => r.date <= filters.toDate!);
    }

    return result;
  }

  async getDeliveryReports(
    companyId: number,
    filters?: {
      fromDate?: string;
      toDate?: string;
      product?: string;
      entity?: string;
      warehouse?: string;
      document?: string;
    },
  ) {
    const reports = await this.drRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });

    let result = reports.map((r) => {
      const products = JSON.parse(r.products || '[]');
      const dateStr =
        r.date instanceof Date ? r.date.toISOString() : String(r.date || '');
      const createdAtStr =
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt);
      return {
        id: r.id,
        code: r.code,
        entity: r.entity,
        warehouse: r.warehouse,
        document: r.document,
        reportType: r.reportType,
        reason: r.reason,
        details: {
          products: products || [],
          totalAmount: products.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0),
        },
        date: dateStr.split('T')[0],
        created_at: createdAtStr,
        createdByName: r.createdByName,
      };
    });

    if (filters?.product) {
      const s = filters.product.toLowerCase();
      result = result.filter((r: any) =>
        r.details?.products?.some(
          (p: any) =>
            p.description?.toLowerCase().includes(s) ||
            p.code?.toLowerCase().includes(s),
        ),
      );
    }
    if (filters?.entity) {
      result = result.filter((r: any) =>
        r.entity?.toLowerCase().includes(filters.entity!.toLowerCase()),
      );
    }
    if (filters?.warehouse) {
      result = result.filter((r: any) =>
        r.warehouse?.toLowerCase().includes(filters.warehouse!.toLowerCase()),
      );
    }
    if (filters?.document) {
      result = result.filter((r: any) =>
        r.document?.toLowerCase().includes(filters.document!.toLowerCase()),
      );
    }
    if (filters?.fromDate) {
      result = result.filter((r: any) => r.date >= filters.fromDate!);
    }
    if (filters?.toDate) {
      result = result.filter((r: any) => r.date <= filters.toDate!);
    }

    return result;
  }

  async getTransferReports(
    companyId: number,
    filters?: {
      fromDate?: string;
      toDate?: string;
      product?: string;
      sourceWarehouse?: string;
      destinationWarehouse?: string;
    },
  ) {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.movement_type = :type', { type: 'transfer' })
      .andWhere('m.source_warehouse IS NOT NULL')
      .andWhere('m.destination_warehouse IS NOT NULL')
      .orderBy('m.created_at', 'DESC');

    // Sólo el movimiento de SALIDA (código 1102/2102/3102) para evitar duplicados
    qb.andWhere('m.movement_code IN (:...exitCodes)', {
      exitCodes: ['1102', '2102', '3102'],
    });

    if (filters?.fromDate) {
      qb.andWhere('m.created_at >= :from', { from: filters.fromDate });
    }
    if (filters?.toDate) {
      qb.andWhere('m.created_at <= :to', { to: filters.toDate + 'T23:59:59' });
    }
    if (filters?.sourceWarehouse) {
      qb.andWhere('m.source_warehouse = :sw', { sw: filters.sourceWarehouse });
    }
    if (filters?.destinationWarehouse) {
      qb.andWhere('m.destination_warehouse = :dw', { dw: filters.destinationWarehouse });
    }

    const movements = await qb.getMany();

    // Cargar items de todos los movimientos en una sola consulta
    const movIds = movements.map((m) => m.id);
    const allItems =
      movIds.length > 0
        ? await this.movementItemRepo
            .createQueryBuilder('mi')
            .where('mi.movement_id IN (:...ids)', { ids: movIds })
            .getMany()
        : [];

    const itemsByMovId = new Map<string, MovementItem[]>();
    for (const item of allItems) {
      const list = itemsByMovId.get(item.movementId) || [];
      list.push(item);
      itemsByMovId.set(item.movementId, list);
    }

    let result = movements.map((m) => {
      const items = itemsByMovId.get(m.id) || [];
      const products = items.map((i) => ({
        code: i.productCode,
        description: i.productName,
        unit: i.productUnit || '-',
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        amount: Number(i.totalAmount),
      }));
      const totalAmount = products.reduce((s, p) => s + p.amount, 0);
      const dateStr =
        m.createdAt instanceof Date
          ? m.createdAt.toISOString()
          : String(m.createdAt);

      return {
        id: m.id,
        relatedMovementId: m.relatedMovementId,
        movementCode: m.movementCode,
        movementDescription: m.movementDescription,
        category: m.category,
        sourceWarehouse: m.sourceWarehouse,
        destinationWarehouse: m.destinationWarehouse,
        reason: m.reason,
        userName: m.userName,
        details: { products, totalAmount },
        date: dateStr.split('T')[0],
        created_at: dateStr,
      };
    });

    if (filters?.product) {
      const s = filters.product.toLowerCase();
      result = result.filter((r) =>
        r.details.products.some(
          (p) =>
            p.description.toLowerCase().includes(s) ||
            p.code.toLowerCase().includes(s),
        ),
      );
    }

    return result;
  }

  async getDashboardStats(companyId: number) {
    const inv = await this.inventoryRepo.find({ where: { companyId } });
    const movements = await this.movementRepo.find({ where: { companyId } });
    const purchaseCount = await this.purchaseRepo.count({
      where: { companyId },
    });

    const totalProducts = inv.length;
    const totalStock = inv.reduce((sum, i) => sum + i.stock, 0);
    const totalValue = inv.reduce(
      (sum, i) => sum + i.stock * Number(i.unitPrice),
      0,
    );
    const lowStockItems = inv.filter(
      (i) => i.stockLimit > 0 && i.stock <= i.stockLimit,
    );
    const totalEntries = movements.filter(
      (m) => m.movementType === 'entry',
    ).length;
    const totalExits = movements.filter(
      (m) => m.movementType === 'exit',
    ).length;
    const totalReturns = movements.filter(
      (m) => m.movementType === 'return',
    ).length;

    return {
      totalProducts,
      totalStock,
      totalValue,
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.map((i) => ({
        productCode: i.productCode,
        productName: i.productName,
        stock: i.stock,
        stockLimit: i.stockLimit,
      })),
      totalEntries,
      totalExits,
      totalReturns,
      totalPurchases: purchaseCount,
    };
  }
}
