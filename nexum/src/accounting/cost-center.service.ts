import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CostCenter } from '../entities/cost-center.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { Voucher } from '../entities/voucher.entity';

@Injectable()
export class CostCenterService {
  constructor(
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
    @InjectRepository(VoucherLine)
    private readonly voucherLineRepo: Repository<VoucherLine>,
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── COST CENTERS CRUD ──
  // ══════════════════════════════════════════════════════════

  async findAllCostCenters(
    companyId: number,
    filters?: {
      type?: string;
      activeOnly?: boolean;
      search?: string;
    },
  ) {
    const qb = this.costCenterRepo.createQueryBuilder('cc');

    qb.where('cc.companyId = :companyId', { companyId });

    if (filters?.type) qb.andWhere('cc.type = :type', { type: filters.type });
    if (filters?.activeOnly) qb.andWhere('cc.isActive = :activeOnly', { activeOnly: true });
    if (filters?.search) {
      qb.andWhere(
        '(cc.code ILIKE :search OR cc.name ILIKE :search OR cc.description ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    qb.orderBy('cc.code', 'ASC');
    return qb.getMany();
  }

  async findOneCostCenter(companyId: number, id: string) {
    const center = await this.costCenterRepo.findOneBy({ id, companyId });
    if (!center) throw new NotFoundException(`Centro de costo #${id} no encontrado`);
    return center;
  }

  async findCostCenterByCode(companyId: number, code: string) {
    const center = await this.costCenterRepo.findOneBy({ code, companyId });
    if (!center) throw new NotFoundException(`Centro de costo con código ${code} no encontrado`);
    return center;
  }

  async createCostCenter(companyId: number, data: Partial<CostCenter>) {
    // Validar que no exista un centro de costo con el mismo código
    const existing = await this.costCenterRepo.findOneBy({
      code: data.code,
      companyId,
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un centro de costo con el código ${data.code}`,
      );
    }

    const costCenter = this.costCenterRepo.create({
      ...data,
      companyId,
      isActive: data.isActive !== false,
    });

    return this.costCenterRepo.save(costCenter);
  }

  async updateCostCenter(
    companyId: number,
    id: string,
    data: Partial<CostCenter>,
  ) {
    const costCenter = await this.findOneCostCenter(companyId, id);

    // Validar código único si se está cambiando
    if (data.code && data.code !== costCenter.code) {
      const existing = await this.costCenterRepo.findOneBy({
        code: data.code,
        companyId,
      });
      if (existing) {
        throw new BadRequestException(
          `Ya existe un centro de costo con el código ${data.code}`,
        );
      }
    }

    Object.assign(costCenter, data);
    return this.costCenterRepo.save(costCenter);
  }

  async deleteCostCenter(companyId: number, id: string) {
    const costCenter = await this.findOneCostCenter(companyId, id);

    // Verificar que no tenga partidas asociadas
    const linesCount = await this.voucherLineRepo.count({
      where: { costCenterId: id },
    });
    if (linesCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar un centro de costo con partidas asociadas',
      );
    }

    return this.costCenterRepo.remove(costCenter);
  }

  // ══════════════════════════════════════════════════════════
  // ── COST CENTER ANALYSIS ──
  // ══════════════════════════════════════════════════════════

  async getCostCenterStatistics(companyId: number) {
    const centers = await this.costCenterRepo.find({
      where: { companyId },
    });

    const active = centers.filter((c) => c.isActive);
    const byType: Record<string, number> = {};

    centers.forEach((center) => {
      byType[center.type] = (byType[center.type] || 0) + 1;
    });

    return {
      total: centers.length,
      active: active.length,
      inactive: centers.length - active.length,
      byType,
    };
  }

  async getCostCenterUsage(companyId: number, fromDate?: string, toDate?: string) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('cc.id', 'costCenterId')
      .addSelect('cc.code', 'costCenterCode')
      .addSelect('cc.name', 'costCenterName')
      .addSelect('cc.type', 'costCenterType')
      .addSelect('COUNT(*)', 'transactionCount')
      .addSelect('SUM(vl.debit)', 'totalDebit')
      .addSelect('SUM(vl.credit)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.costCenterId IS NOT NULL');

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.groupBy('cc.id, cc.code, cc.name, cc.type')
      .orderBy('transactionCount', 'DESC');

    const results = await qb.getRawMany();

    return results.map((row: any) => ({
      costCenterId: row.costCenterId,
      costCenterCode: row.costCenterCode,
      costCenterName: row.costCenterName,
      costCenterType: row.costCenterType,
      transactionCount: parseInt(row.transactionCount),
      totalDebit: Number(row.totalDebit || 0),
      totalCredit: Number(row.totalCredit || 0),
      totalAmount: Number(row.totalDebit || 0) + Number(row.totalCredit || 0),
    }));
  }

  async getCostCenterBalance(companyId: number, costCenterId: string, asOfDate?: string) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('SUM(vl.debit)', 'totalDebit')
      .addSelect('SUM(vl.credit)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.costCenterId = :costCenterId', { costCenterId });

    if (asOfDate) {
      qb.andWhere('v.date <= :asOfDate', { asOfDate });
    }

    const result = await qb.getRawOne();

    return {
      costCenterId,
      totalDebit: Number(result?.totalDebit || 0),
      totalCredit: Number(result?.totalCredit || 0),
      netAmount: Number(result?.totalDebit || 0) - Number(result?.totalCredit || 0),
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── COST CENTER REPORTS ──
  // ══════════════════════════════════════════════════════════

  async getCostCenterReport(companyId: number, fromDate?: string, toDate?: string) {
    const centers = await this.findAllCostCenters(companyId, { activeOnly: true });
    const usage = await this.getCostCenterUsage(companyId, fromDate, toDate);

    const report = centers.map((center) => {
      const usageData = usage.find((u) => u.costCenterId === center.id);
      return {
        id: center.id,
        code: center.code,
        name: center.name,
        type: center.type,
        description: center.description,
        isActive: center.isActive,
        transactionCount: usageData?.transactionCount || 0,
        totalDebit: usageData?.totalDebit || 0,
        totalCredit: usageData?.totalCredit || 0,
        totalAmount: usageData?.totalAmount || 0,
        hasTransactions: (usageData?.transactionCount || 0) > 0,
      };
    });

    const totals = report.reduce(
      (acc, center) => ({
        transactionCount: acc.transactionCount + center.transactionCount,
        totalDebit: acc.totalDebit + center.totalDebit,
        totalCredit: acc.totalCredit + center.totalCredit,
        totalAmount: acc.totalAmount + center.totalAmount,
        activeCenters: acc.activeCenters + (center.isActive ? 1 : 0),
        centersWithTransactions: acc.centersWithTransactions + (center.hasTransactions ? 1 : 0),
      }),
      {
        transactionCount: 0,
        totalDebit: 0,
        totalCredit: 0,
        totalAmount: 0,
        activeCenters: 0,
        centersWithTransactions: 0,
      },
    );

    return {
      centers: report,
      totals,
      summary: {
        totalCenters: centers.length,
        activeCenters: totals.activeCenters,
        centersWithTransactions: totals.centersWithTransactions,
        totalTransactions: totals.transactionCount,
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        totalAmount: totals.totalAmount,
      },
    };
  }

  async getCostCenterTransactions(companyId: number, costCenterId: string, filters?: {
    fromDate?: string;
    toDate?: string;
    accountCode?: string;
  }) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .leftJoinAndSelect('vl.voucher', 'v')
      .leftJoinAndSelect('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.costCenterId = :costCenterId', { costCenterId });

    if (filters?.fromDate) qb.andWhere('v.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate) qb.andWhere('v.date <= :toDate', { toDate: filters.toDate });
    if (filters?.accountCode) qb.andWhere('vl.accountCode = :accountCode', { accountCode: filters.accountCode });

    qb.orderBy('v.date', 'DESC')
      .addOrderBy('v.voucherNumber', 'DESC')
      .addOrderBy('vl.lineOrder', 'ASC');

    return qb.getMany();
  }

  // ══════════════════════════════════════════════════════════
  // ── VALIDATION HELPERS ──
  // ══════════════════════════════════════════════════════════

  async validateCostCenterCode(companyId: number, code: string, excludeId?: string) {
    const qb = this.costCenterRepo.createQueryBuilder('cc')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.code = :code', { code });

    if (excludeId) {
      qb.andWhere('cc.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    return existing ? false : true;
  }

  async getUnusedCostCenters(companyId: number) {
    const qb = this.costCenterRepo
      .createQueryBuilder('cc')
      .leftJoin('cc.voucherLines', 'vl')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('vl.id IS NULL')
      .andWhere('cc.isActive = :isActive', { isActive: true });

    return qb.getMany();
  }

  async getMostUsedCostCenters(companyId: number, limit: number = 10, fromDate?: string, toDate?: string) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('cc.id', 'costCenterId')
      .addSelect('cc.code', 'costCenterCode')
      .addSelect('cc.name', 'costCenterName')
      .addSelect('COUNT(*)', 'usageCount')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.costCenterId IS NOT NULL');

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.groupBy('cc.id, cc.code, cc.name')
      .orderBy('usageCount', 'DESC')
      .limit(limit);

    return qb.getRawMany();
  }
}
