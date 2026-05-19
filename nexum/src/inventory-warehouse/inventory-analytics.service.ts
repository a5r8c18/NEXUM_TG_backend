import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { Movement } from '../entities/movement.entity';

@Injectable()
export class InventoryAnalyticsService {
  private readonly logger = new Logger(InventoryAnalyticsService.name);

  constructor(
    @InjectRepository(InventoryWarehouse)
    private readonly inventoryWarehouseRepo: Repository<InventoryWarehouse>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
  ) {}

  async getRotationAnalytics(companyId: number, filters?: {
    warehouseId?: string;
    category?: string;
    period?: number; // días para análisis (default: 365)
  }) {
    const period = filters?.period || 365;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - period);

    // Obtener inventario actual
    const qb = this.inventoryWarehouseRepo
      .createQueryBuilder('iw')
      .where('iw.company_id = :companyId', { companyId })
      .andWhere('iw.stock > 0');

    if (filters?.warehouseId) {
      qb.andWhere('iw.warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });
    }

    const currentInventory = await qb.getMany();

    // Obtener movimientos de salida en el período
    const movementsQb = this.movementRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.movement_type IN (:...types)', { types: ['exit', 'transfer'] })
      .andWhere('m.created_at >= :cutoffDate', { cutoffDate });

    if (filters?.warehouseId) {
      movementsQb.andWhere(
        '(m.source_warehouse = :warehouseId OR m.destination_warehouse = :warehouseId)',
        { warehouseId: filters.warehouseId }
      );
    }

    const movements = await movementsQb.getMany();

    // Calcular analytics para cada producto
    const analytics: any[] = [];
    const totalValue = currentInventory.reduce((sum, item) => sum + (item.stock * item.unitPrice), 0);

    for (const item of currentInventory) {
      // Calcular consumo total en el período
      const exits = movements
        .filter(m => m.productCode === item.productCode)
        .filter(m => 
          filters?.warehouseId ? 
          (m.sourceWarehouse === filters.warehouseId || m.destinationWarehouse === filters.warehouseId) :
          true
        )
        .reduce((sum, m) => sum + m.quantity, 0);

      // Calcular rotación (veces que se consume el stock promedio en el período)
      const averageStock = item.stock + (exits / 2); // Stock promedio aproximado
      const rotationRate = averageStock > 0 ? exits / averageStock : 0;
      
      // Calcular días de inventario
      const dailyDemand = exits / period;
      const daysOfInventory = dailyDemand > 0 ? item.stock / dailyDemand : 999;

      // Calcular valor del inventario
      const inventoryValue = item.stock * item.unitPrice;
      const valuePercentage = totalValue > 0 ? (inventoryValue / totalValue) * 100 : 0;

      // Clasificación ABC (basado en valor acumulado)
      let abcClass = 'C';
      if (valuePercentage >= 80) abcClass = 'A';
      else if (valuePercentage >= 20) abcClass = 'B';

      // Clasificación XYZ (basado en variabilidad de demanda)
      let xyzClass = 'Z'; // Demanda errática
      if (rotationRate >= 4) xyzClass = 'X'; // Demanda constante
      else if (rotationRate >= 2) xyzClass = 'Y'; // Demanda moderada

      analytics.push({
        productCode: item.productCode,
        productName: item.productName,
        warehouseId: item.warehouseId,
        warehouseName: item.warehouseName,
        category: 'mercancia', // Podría obtenerse del producto
        currentStock: item.stock,
        unitPrice: item.unitPrice,
        inventoryValue,
        valuePercentage: Math.round(valuePercentage * 100) / 100,
        periodExits: exits,
        rotationRate: Math.round(rotationRate * 100) / 100,
        daysOfInventory: Math.round(daysOfInventory * 100) / 100,
        abcClass,
        xyzClass,
        recommendation: this.getRecommendation(abcClass, xyzClass, daysOfInventory),
      });
    }

    // Ordenar por valor descendente para ABC
    analytics.sort((a, b) => b.inventoryValue - a.inventoryValue);

    // Calcular totales y clasificaciones
    const summary = {
      totalProducts: analytics.length,
      totalValue,
      totalStock: analytics.reduce((sum, item) => sum + item.currentStock, 0),
      totalExits: analytics.reduce((sum, item) => sum + item.periodExits, 0),
      averageDaysOfInventory: analytics.length > 0 
        ? analytics.reduce((sum, item) => sum + item.daysOfInventory, 0) / analytics.length 
        : 0,
      abcDistribution: {
        A: analytics.filter(item => item.abcClass === 'A').length,
        B: analytics.filter(item => item.abcClass === 'B').length,
        C: analytics.filter(item => item.abcClass === 'C').length,
      },
      xyzDistribution: {
        X: analytics.filter(item => item.xyzClass === 'X').length,
        Y: analytics.filter(item => item.xyzClass === 'Y').length,
        Z: analytics.filter(item => item.xyzClass === 'Z').length,
      },
    };

    return {
      period,
      warehouseId: filters?.warehouseId || 'all',
      summary,
      analytics,
      slowMovingItems: analytics.filter(item => item.daysOfInventory > 90),
      fastMovingItems: analytics.filter(item => item.daysOfInventory < 30),
      criticalItems: analytics.filter(item => item.abcClass === 'A' && item.daysOfInventory < 15),
    };
  }

  private getRecommendation(abcClass: string, xyzClass: string, daysOfInventory: number): string {
    // Lógica de recomendaciones según clasificación ABC-XYZ y días de inventario
    if (abcClass === 'A' && xyzClass === 'X') {
      if (daysOfInventory < 15) return 'Reponer stock urgentemente - producto crítico de alta rotación';
      if (daysOfInventory > 60) return 'Reducir stock - exceso de inventario en producto crítico';
      return 'Mantener stock óptimo - monitorear frecuencia';
    }

    if (abcClass === 'A' && xyzClass === 'Z') {
      return 'Revisar pronósticos - alta variabilidad en producto crítico';
    }

    if (abcClass === 'C' && daysOfInventory > 180) {
      return 'Considerar eliminación o descuento - producto de bajo valor y lento movimiento';
    }

    if (daysOfInventory > 365) {
      return 'Producto obsoleto - considerar liquidación';
    }

    if (daysOfInventory < 7) {
      return 'Stock crítico bajo - reponer inmediatamente';
    }

    return 'Monitorear y ajustar según demanda';
  }

  async getSlowMovingReport(companyId: number, warehouseId?: string) {
    const analytics = await this.getRotationAnalytics(companyId, { 
      warehouseId, 
      period: 180 // 6 meses
    });

    return {
      ...analytics,
      slowMovingByCategory: analytics.analytics.reduce((acc, item: any) => {
        const category = item.category || 'sin_categoria';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recommendations: this.generateBulkRecommendations(analytics.analytics),
    };
  }

  private generateBulkRecommendations(items: any[]): string[] {
    const recommendations: string[] = [];

    const slowMoving = items.filter(item => item.daysOfInventory > 90);
    const criticalLow = items.filter(item => item.daysOfInventory < 7);
    const excessInventory = items.filter(item => item.daysOfInventory > 180);

    if (slowMoving.length > 0) {
      recommendations.push(`${slowMoving.length} productos con movimiento lento (>90 días)`);
    }

    if (criticalLow.length > 0) {
      recommendations.push(`${criticalLow.length} productos con stock crítico bajo (<7 días)`);
    }

    if (excessInventory.length > 0) {
      recommendations.push(`${excessInventory.length} productos con exceso de inventario (>180 días)`);
    }

    const totalValueSlow = slowMoving.reduce((sum, item) => sum + item.inventoryValue, 0);
    if (totalValueSlow > 10000) {
      recommendations.push(`Alto valor capitalizado en productos lentos: $${totalValueSlow.toLocaleString()}`);
    }

    return recommendations;
  }
}
