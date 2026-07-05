import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountPayable } from '../entities/account-payable.entity';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { InventoryAnalyticsService } from './inventory-analytics.service';

export interface CashTensionLevel {
  level: 'low' | 'moderate' | 'high' | 'critical';
  score: number; // 0-100
  description: string;
}

export interface WorkingCapitalReport {
  companyId: number;
  generatedAt: string;
  period: number;
  cxc: {
    totalPending: number;
    totalOverdue: number;
    count: number;
    overdueCount: number;
    averageDaysOutstanding: number;
    agingBuckets: Record<string, number>;
  };
  cxp: {
    totalPending: number;
    totalOverdue: number;
    count: number;
    overdueCount: number;
    averageDaysOutstanding: number;
    agingBuckets: Record<string, number>;
  };
  inventory: {
    totalValue: number;
    slowMovingValue: number;
    fastMovingValue: number;
    averageDaysOfInventory: number;
    totalProducts: number;
    slowMovingCount: number;
  };
  indicators: {
    cashConversionCycle: number;
    daysInventoryOutstanding: number;
    daysSalesOutstanding: number;
    daysPayableOutstanding: number;
    workingCapitalBalance: number;
    liquidityRatio: number;
  };
  cashTension: CashTensionLevel;
  tensionFactors: string[];
  recommendations: string[];
}

@Injectable()
export class WorkingCapitalService {
  private readonly logger = new Logger(WorkingCapitalService.name);

  constructor(
    @InjectRepository(AccountPayable)
    private readonly apRepo: Repository<AccountPayable>,
    @InjectRepository(AccountReceivable)
    private readonly arRepo: Repository<AccountReceivable>,
    private readonly analyticsService: InventoryAnalyticsService,
  ) {}

  async getWorkingCapitalReport(
    companyId: number,
    period = 90,
  ): Promise<WorkingCapitalReport> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // ── 1. CxC ──
    const receivables = await this.arRepo.find({ where: { companyId } });
    const pendingAR = receivables.filter(r => r.status !== 'paid' && r.status !== 'written_off');
    const overdueAR = pendingAR.filter(r => r.dueDate < todayStr);
    const totalArBalance = pendingAR.reduce((s, r) => s + Number(r.balanceAmount), 0);
    const totalArOverdue = overdueAR.reduce((s, r) => s + Number(r.balanceAmount), 0);
    const arAging = this.buildAgingBuckets(
      pendingAR.map(r => ({ dueDate: r.dueDate, balance: Number(r.balanceAmount) })),
      todayStr,
    );
    const dso = this.averageAge(pendingAR.map(r => r.createdAt), today);

    // ── 2. CxP ──
    const payables = await this.apRepo.find({ where: { companyId } });
    const pendingAP = payables.filter(p => p.status !== 'paid' && p.status !== 'cancelled');
    const overdueAP = pendingAP.filter(p => p.dueDate < todayStr);
    const totalApBalance = pendingAP.reduce((s, p) => s + Number(p.balanceAmount), 0);
    const totalApOverdue = overdueAP.reduce((s, p) => s + Number(p.balanceAmount), 0);
    const apAging = this.buildAgingBuckets(
      pendingAP.map(p => ({ dueDate: p.dueDate, balance: Number(p.balanceAmount) })),
      todayStr,
    );
    const dpo = this.averageAge(pendingAP.map(p => p.createdAt), today);

    // ── 3. Inventario (InventoryAnalyticsService) ──
    const inventoryData = await this.analyticsService.getRotationAnalytics(companyId, { period });
    const slowMovingValue = (inventoryData.slowMovingItems as any[])
      .reduce((s, i) => s + i.inventoryValue, 0);
    const fastMovingValue = (inventoryData.fastMovingItems as any[])
      .reduce((s, i) => s + i.inventoryValue, 0);
    const dio = inventoryData.summary.averageDaysOfInventory;

    // ── 4. Indicadores ──
    const ccc = dio + dso - dpo; // Cash Conversion Cycle
    const workingCapitalBalance = totalArBalance + inventoryData.summary.totalValue - totalApBalance;
    const liquidityRatio = totalApBalance > 0 ? totalArBalance / totalApBalance : 99;

    // ── 5. Análisis de tensión de caja ──
    const { tension, factors, recommendations } = this.analyzeCashTension({
      ccc,
      dso,
      dpo,
      dio,
      totalArOverdue,
      totalApOverdue,
      slowMovingValue,
      totalArBalance,
      totalApBalance,
      liquidityRatio,
    });

    return {
      companyId,
      generatedAt: today.toISOString(),
      period,
      cxc: {
        totalPending: totalArBalance,
        totalOverdue: totalArOverdue,
        count: pendingAR.length,
        overdueCount: overdueAR.length,
        averageDaysOutstanding: Math.round(dso * 10) / 10,
        agingBuckets: arAging,
      },
      cxp: {
        totalPending: totalApBalance,
        totalOverdue: totalApOverdue,
        count: pendingAP.length,
        overdueCount: overdueAP.length,
        averageDaysOutstanding: Math.round(dpo * 10) / 10,
        agingBuckets: apAging,
      },
      inventory: {
        totalValue: inventoryData.summary.totalValue,
        slowMovingValue,
        fastMovingValue,
        averageDaysOfInventory: Math.round(dio * 10) / 10,
        totalProducts: inventoryData.summary.totalProducts,
        slowMovingCount: inventoryData.slowMovingItems.length,
      },
      indicators: {
        cashConversionCycle: Math.round(ccc * 10) / 10,
        daysInventoryOutstanding: Math.round(dio * 10) / 10,
        daysSalesOutstanding: Math.round(dso * 10) / 10,
        daysPayableOutstanding: Math.round(dpo * 10) / 10,
        workingCapitalBalance: Math.round(workingCapitalBalance * 100) / 100,
        liquidityRatio: Math.round(liquidityRatio * 100) / 100,
      },
      cashTension: tension,
      tensionFactors: factors,
      recommendations,
    };
  }

  private analyzeCashTension(data: {
    ccc: number;
    dso: number;
    dpo: number;
    dio: number;
    totalArOverdue: number;
    totalApOverdue: number;
    slowMovingValue: number;
    totalArBalance: number;
    totalApBalance: number;
    liquidityRatio: number;
  }): { tension: CashTensionLevel; factors: string[]; recommendations: string[] } {
    let score = 0;
    const factors: string[] = [];
    const recommendations: string[] = [];

    // Factor 1: Ciclo de Conversión de Caja (CCC)
    if (data.ccc > 120) {
      score += 35;
      factors.push(`Ciclo de conversión de caja muy largo: ${Math.round(data.ccc)} días`);
      recommendations.push('Reducir días de inventario y acelerar cobros para acortar el CCC');
    } else if (data.ccc > 60) {
      score += 20;
      factors.push(`Ciclo de conversión de caja elevado: ${Math.round(data.ccc)} días`);
      recommendations.push('Negociar plazos de pago más largos con proveedores');
    } else if (data.ccc > 30) {
      score += 10;
    }

    // Factor 2: CxC vencidas
    if (data.totalArBalance > 0) {
      const overdueRatio = data.totalArOverdue / data.totalArBalance;
      if (overdueRatio > 0.5) {
        score += 25;
        factors.push(`${Math.round(overdueRatio * 100)}% de CxC vencidas - riesgo alto de incobrables`);
        recommendations.push('Activar gestión de cobros urgente para CxC vencidas');
      } else if (overdueRatio > 0.2) {
        score += 15;
        factors.push(`${Math.round(overdueRatio * 100)}% de CxC vencidas`);
        recommendations.push('Revisar política de crédito y seguimiento de cobros');
      }
    }

    // Factor 3: CxP vencidas (presión inmediata de pago)
    if (data.totalApBalance > 0) {
      const apOverdueRatio = data.totalApOverdue / data.totalApBalance;
      if (apOverdueRatio > 0.3) {
        score += 20;
        factors.push(`${Math.round(apOverdueRatio * 100)}% de CxP vencidas - riesgo de corte de suministro`);
        recommendations.push('Priorizar pagos vencidos a proveedores críticos');
      } else if (apOverdueRatio > 0.1) {
        score += 10;
        factors.push(`${Math.round(apOverdueRatio * 100)}% de CxP vencidas`);
      }
    }

    // Factor 4: Inventario inmovilizado
    if (data.slowMovingValue > 0 && (data.totalArBalance + data.totalApBalance) > 0) {
      const immobilizedRatio = data.slowMovingValue / (data.totalArBalance + data.totalApBalance + data.slowMovingValue);
      if (immobilizedRatio > 0.4) {
        score += 15;
        factors.push(`Alto inventario de movimiento lento inmoviliza capital: ${Math.round(immobilizedRatio * 100)}% del activo circulante`);
        recommendations.push('Ejecutar campaña de liquidación de inventario lento para liberar efectivo');
      } else if (immobilizedRatio > 0.2) {
        score += 8;
        factors.push(`Inventario lento representa ${Math.round(immobilizedRatio * 100)}% del activo circulante`);
        recommendations.push('Revisar política de reposición para reducir stock de baja rotación');
      }
    }

    // Factor 5: Ratio de liquidez CxC/CxP
    if (data.liquidityRatio < 0.5) {
      score += 10;
      factors.push(`Ratio CxC/CxP bajo (${data.liquidityRatio.toFixed(2)}): se paga más de lo que se cobra`);
      recommendations.push('Aumentar ventas a crédito o reducir compras hasta equilibrar el ratio');
    } else if (data.liquidityRatio > 3) {
      factors.push(`Alto saldo en CxC (ratio ${data.liquidityRatio.toFixed(2)}): efectivo atrapado en clientes`);
      recommendations.push('Intensificar gestión de cobros para convertir CxC en efectivo');
      score += 5;
    }

    // DSO muy alto
    if (data.dso > 60) {
      score += 5;
      factors.push(`Días promedio de cobro elevados: ${Math.round(data.dso)} días`);
    }

    // Determinar nivel de tensión
    let tension: CashTensionLevel;
    if (score >= 60) {
      tension = { level: 'critical', score, description: 'Tensión de caja crítica: riesgo inmediato de iliquidez' };
    } else if (score >= 35) {
      tension = { level: 'high', score, description: 'Tensión de caja alta: requiere acción correctiva urgente' };
    } else if (score >= 15) {
      tension = { level: 'moderate', score, description: 'Tensión de caja moderada: monitorear indicadores' };
    } else {
      tension = { level: 'low', score, description: 'Capital de trabajo saludable' };
    }

    if (recommendations.length === 0) {
      recommendations.push('Capital de trabajo en niveles aceptables. Mantener monitoreo mensual.');
    }

    return { tension, factors, recommendations };
  }

  private buildAgingBuckets(
    items: { dueDate: string; balance: number }[],
    todayStr: string,
  ): Record<string, number> {
    const buckets: Record<string, number> = {
      current: 0,
      '1-30': 0,
      '31-60': 0,
      '61-90': 0,
      'over-90': 0,
    };

    for (const item of items) {
      if (item.dueDate >= todayStr) {
        buckets['current'] += item.balance;
        continue;
      }
      const diffDays = Math.floor(
        (new Date(todayStr).getTime() - new Date(item.dueDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays <= 30) buckets['1-30'] += item.balance;
      else if (diffDays <= 60) buckets['31-60'] += item.balance;
      else if (diffDays <= 90) buckets['61-90'] += item.balance;
      else buckets['over-90'] += item.balance;
    }

    // Redondear
    for (const key of Object.keys(buckets)) {
      buckets[key] = Math.round(buckets[key] * 100) / 100;
    }

    return buckets;
  }

  private averageAge(dates: Date[], today: Date): number {
    if (dates.length === 0) return 0;
    const totalDays = dates.reduce((s, d) => {
      return s + (today.getTime() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
    }, 0);
    return totalDays / dates.length;
  }
}
