import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReceptionReport } from '../entities/reception-report.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import { Inventory } from '../entities/inventory.entity';
import { Movement } from '../entities/movement.entity';
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
      const details = JSON.parse(r.details);
      const createdAtStr =
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt);
      return {
        id: r.id,
        purchaseId: r.purchaseId,
        entity: details.entity,
        warehouse: details.warehouse,
        supplier: details.supplier,
        document: details.document,
        products: details.products,
        date: createdAtStr.split('T')[0],
        createdAt: createdAtStr,
        createdByName: r.createdByName,
      };
    });

    if (filters?.product) {
      const s = filters.product.toLowerCase();
      result = result.filter((r: any) =>
        r.products.some(
          (p: any) =>
            p.description.toLowerCase().includes(s) ||
            p.code.toLowerCase().includes(s),
        ),
      );
    }
    if (filters?.entity) {
      result = result.filter((r: any) =>
        r.entity.toLowerCase().includes(filters.entity!.toLowerCase()),
      );
    }
    if (filters?.warehouse) {
      result = result.filter((r: any) =>
        r.warehouse.toLowerCase().includes(filters.warehouse!.toLowerCase()),
      );
    }
    if (filters?.document) {
      result = result.filter((r: any) =>
        r.document.toLowerCase().includes(filters.document!.toLowerCase()),
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
      const products = JSON.parse(r.products);
      const dateStr =
        r.date instanceof Date ? r.date.toISOString() : String(r.date || '');
      return {
        id: r.id,
        code: r.code,
        entity: r.entity,
        warehouse: r.warehouse,
        document: r.document,
        reportType: r.reportType,
        reason: r.reason,
        products,
        date: dateStr.split('T')[0],
        createdAt: dateStr,
        createdByName: r.createdByName,
      };
    });

    if (filters?.product) {
      const s = filters.product.toLowerCase();
      result = result.filter((r: any) =>
        r.products.some(
          (p: any) =>
            p.description.toLowerCase().includes(s) ||
            p.code.toLowerCase().includes(s),
        ),
      );
    }
    if (filters?.entity) {
      result = result.filter((r: any) =>
        r.entity.toLowerCase().includes(filters.entity!.toLowerCase()),
      );
    }
    if (filters?.warehouse) {
      result = result.filter((r: any) =>
        r.warehouse.toLowerCase().includes(filters.warehouse!.toLowerCase()),
      );
    }
    if (filters?.document) {
      result = result.filter((r: any) =>
        r.document.toLowerCase().includes(filters.document!.toLowerCase()),
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
