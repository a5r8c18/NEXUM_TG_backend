import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockLimit } from '../entities/stock-limit.entity';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';

export interface StockWarning {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  status: 'out_of_stock' | 'below_reorder' | 'low_stock' | 'overstock' | 'optimal';
  urgency: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

@Injectable()
export class StockLimitsService {
  private readonly logger = new Logger(StockLimitsService.name);

  constructor(
    @InjectRepository(StockLimit)
    private readonly slRepo: Repository<StockLimit>,
    private readonly inventoryWarehouseService: InventoryWarehouseService,
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
    const companyId = data.companyId || 1;

    // Obtener datos reales del inventario para nombre de producto y stock actual
    const inventory = await this.inventoryWarehouseService
      .findByCompanyProductAndWarehouse(companyId, data.productId, data.warehouseId)
      .catch(() => null);

    const sl = this.slRepo.create({
      companyId,
      productCode: data.productId,
      productName: inventory?.productName || 'Producto ' + data.productId,
      warehouseId: data.warehouseId,
      warehouseName: inventory?.warehouseName || 'Almacén',
      minStock: data.minStock,
      maxStock: data.maxStock,
      currentStock: inventory?.stock || 0,
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

  // ── Sincronizar currentStock con el stock real del almacén (Res. 235-2005 MFP) ──
  async syncCurrentStock(companyId: number, warehouseId?: string): Promise<number> {
    const where: any = { companyId, isActive: true };
    if (warehouseId) where.warehouseId = warehouseId;

    const limits = await this.slRepo.find({ where });
    let updated = 0;

    for (const sl of limits) {
      const inventory = await this.inventoryWarehouseService
        .findByCompanyProductAndWarehouse(sl.companyId, sl.productCode, sl.warehouseId)
        .catch(() => null);

      const realStock = inventory?.stock ?? 0;
      if (sl.currentStock !== realStock) {
        sl.currentStock = realStock;
        sl.productName = inventory?.productName || sl.productName;
        sl.warehouseName = inventory?.warehouseName || sl.warehouseName;
        await this.slRepo.save(sl);
        updated++;
      }
    }

    this.logger.log(`Stock sincronizado: ${updated}/${limits.length} registros actualizados`);
    return updated;
  }

  // ── Verificar alertas después de un movimiento (llamado desde MovementsService) ──
  async checkAfterMovement(
    companyId: number,
    productCode: string,
    warehouseId: string,
  ): Promise<StockWarning | null> {
    const sl = await this.slRepo.findOne({
      where: { companyId, productCode, warehouseId, isActive: true },
    });

    if (!sl) return null;

    // Obtener stock real desde InventoryWarehouse
    const inventory = await this.inventoryWarehouseService
      .findByCompanyProductAndWarehouse(companyId, productCode, warehouseId)
      .catch(() => null);

    const realStock = inventory?.stock ?? 0;

    // Actualizar currentStock en el registro
    if (sl.currentStock !== realStock) {
      sl.currentStock = realStock;
      await this.slRepo.save(sl);
    }

    return this.evaluateStockStatus(sl);
  }

  // ── Evaluación de estado según normativa cubana MFP ──
  private evaluateStockStatus(sl: StockLimit): StockWarning {
    let status: StockWarning['status'];
    let urgency: StockWarning['urgency'];
    let message: string;

    if (sl.currentStock === 0) {
      status = 'out_of_stock';
      urgency = 'critical';
      message = `⛔ ${sl.productName} AGOTADO en ${sl.warehouseName}. Requiere reabastecimiento inmediato.`;
    } else if (sl.reorderPoint > 0 && sl.currentStock <= sl.reorderPoint) {
      status = 'below_reorder';
      urgency = 'high';
      message = `🔴 ${sl.productName} alcanzó punto de reorden (${sl.currentStock}/${sl.reorderPoint}) en ${sl.warehouseName}. Generar solicitud de compra.`;
    } else if (sl.currentStock < sl.minStock) {
      status = 'low_stock';
      urgency = 'high';
      message = `🟠 ${sl.productName} por debajo del mínimo (${sl.currentStock}/${sl.minStock}) en ${sl.warehouseName}.`;
    } else if (sl.maxStock > 0 && sl.currentStock > sl.maxStock) {
      status = 'overstock';
      urgency = 'medium';
      message = `🟡 ${sl.productName} excede máximo (${sl.currentStock}/${sl.maxStock}) en ${sl.warehouseName}. Riesgo de deterioro/inmovilización.`;
    } else {
      status = 'optimal';
      urgency = 'low';
      message = `✅ ${sl.productName} tiene stock óptimo (${sl.currentStock}) en ${sl.warehouseName}.`;
    }

    return {
      productId: sl.productCode,
      productName: sl.productName,
      warehouseId: sl.warehouseId,
      warehouseName: sl.warehouseName,
      currentStock: sl.currentStock,
      minStock: sl.minStock,
      maxStock: sl.maxStock,
      reorderPoint: sl.reorderPoint,
      status,
      urgency,
      message,
    };
  }

  async getWarnings(companyId?: string, warehouseId?: string): Promise<StockWarning[]> {
    const numericCompanyId = companyId ? Number(companyId) : undefined;

    // Sincronizar stock real antes de evaluar
    if (numericCompanyId) {
      await this.syncCurrentStock(numericCompanyId, warehouseId);
    }

    const where: any = { isActive: true };
    if (numericCompanyId) where.companyId = numericCompanyId;
    if (warehouseId) where.warehouseId = warehouseId;

    const limits = await this.slRepo.find({ where });
    return limits.map((sl) => this.evaluateStockStatus(sl));
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
