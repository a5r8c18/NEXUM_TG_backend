import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockLimit } from '../entities/stock-limit.entity';

@Injectable()
export class StockLimitsService {
  constructor(
    @InjectRepository(StockLimit)
    private readonly slRepo: Repository<StockLimit>,
  ) {}

  async findAll(companyId?: string, warehouseId?: string) {
    const where: any = {};
    if (companyId) where.companyId = Number(companyId);
    if (warehouseId) where.warehouseId = warehouseId;
    return this.slRepo.find({ where });
  }

  async findOne(id: string) {
    const sl = await this.slRepo.findOneBy({ id });
    if (!sl) throw new NotFoundException(`Stock limit #${id} no encontrado`);
    return sl;
  }

  async create(data: {
    productId: string;
    warehouseId: string;
    minStock: number;
    maxStock: number;
    reorderPoint: number;
    companyId?: number;
  }) {
    const sl = this.slRepo.create({
      companyId: data.companyId || 1,
      productCode: data.productId,
      productName: 'Producto ' + data.productId,
      warehouseId: data.warehouseId,
      warehouseName: 'Almacén',
      minStock: data.minStock,
      maxStock: data.maxStock,
      currentStock: 0,
      reorderPoint: data.reorderPoint,
      isActive: true,
    });
    return this.slRepo.save(sl);
  }

  async update(
    id: string,
    data: {
      minStock?: number;
      maxStock?: number;
      reorderPoint?: number;
      isActive?: boolean;
    },
  ) {
    const sl = await this.findOne(id);
    if (data.minStock !== undefined) sl.minStock = data.minStock;
    if (data.maxStock !== undefined) sl.maxStock = data.maxStock;
    if (data.reorderPoint !== undefined) sl.reorderPoint = data.reorderPoint;
    if (data.isActive !== undefined) sl.isActive = data.isActive;
    return this.slRepo.save(sl);
  }

  async remove(id: string) {
    const sl = await this.findOne(id);
    await this.slRepo.remove(sl);
    return { message: 'Límite de stock eliminado correctamente' };
  }

  async getWarnings(companyId?: string, warehouseId?: string) {
    const where: any = { isActive: true };
    if (companyId) where.companyId = Number(companyId);
    if (warehouseId) where.warehouseId = warehouseId;

    const limits = await this.slRepo.find({ where });

    return limits.map((sl) => {
      let status: string;
      let urgency: string;
      let message: string;

      if (sl.currentStock === 0) {
        status = 'out_of_stock';
        urgency = 'critical';
        message = `${sl.productName} está agotado en ${sl.warehouseName}`;
      } else if (sl.currentStock < sl.minStock) {
        status = 'low_stock';
        urgency = 'high';
        message = `${sl.productName} tiene stock bajo (${sl.currentStock}/${sl.minStock}) en ${sl.warehouseName}`;
      } else if (sl.currentStock > sl.maxStock) {
        status = 'overstock';
        urgency = 'medium';
        message = `${sl.productName} tiene exceso de stock (${sl.currentStock}/${sl.maxStock}) en ${sl.warehouseName}`;
      } else {
        status = 'optimal';
        urgency = 'low';
        message = `${sl.productName} tiene stock óptimo en ${sl.warehouseName}`;
      }

      return {
        productId: sl.productCode,
        productName: sl.productName,
        warehouseId: sl.warehouseId,
        warehouseName: sl.warehouseName,
        currentStock: sl.currentStock,
        minStock: sl.minStock,
        maxStock: sl.maxStock,
        status,
        message,
        urgency,
      };
    });
  }

  async bulkCreate(
    limits: Array<{
      productId: string;
      warehouseId: string;
      minStock: number;
      maxStock: number;
      reorderPoint: number;
    }>,
  ) {
    const results: StockLimit[] = [];
    for (const l of limits) {
      results.push(await this.create(l));
    }
    return results;
  }
}
