import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Budget } from '../entities/budget.entity';
import { BudgetLine } from '../entities/budget-line.entity';
import { VoucherLine } from '../entities/voucher-line.entity';

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @InjectRepository(Budget)
    private readonly budgetRepo: Repository<Budget>,
    @InjectRepository(BudgetLine)
    private readonly lineRepo: Repository<BudgetLine>,
    @InjectRepository(VoucherLine)
    private readonly voucherLineRepo: Repository<VoucherLine>,
  ) {}

  async findAll(companyId: number, year?: number) {
    const where: any = { companyId };
    if (year) where.year = year;
    return this.budgetRepo.find({
      where,
      order: { year: 'DESC', name: 'ASC' },
    });
  }

  async findOne(companyId: number, id: string) {
    const budget = await this.budgetRepo.findOneBy({ id, companyId });
    if (!budget) throw new NotFoundException(`Presupuesto #${id} no encontrado`);

    const lines = await this.lineRepo.find({
      where: { budgetId: id },
      order: { accountCode: 'ASC', month: 'ASC' },
    });

    return { budget, lines };
  }

  async create(companyId: number, data: any) {
    const budget = this.budgetRepo.create({
      companyId,
      name: data.name,
      description: data.description,
      year: data.year,
      status: 'draft',
      totalAmount: 0,
    });
    const saved = await this.budgetRepo.save(budget);

    // Create lines if provided
    if (data.lines && Array.isArray(data.lines)) {
      let total = 0;
      for (const lineData of data.lines) {
        const line = this.lineRepo.create({
          budgetId: saved.id,
          accountCode: lineData.accountCode,
          accountName: lineData.accountName,
          month: lineData.month || null,
          plannedAmount: Number(lineData.plannedAmount),
          notes: lineData.notes,
        });
        total += Number(lineData.plannedAmount);
        await this.lineRepo.save(line);
      }
      saved.totalAmount = total;
      await this.budgetRepo.save(saved);
    }

    return saved;
  }

  async addLine(companyId: number, budgetId: string, data: any) {
    const budget = await this.budgetRepo.findOneBy({ id: budgetId, companyId });
    if (!budget) throw new NotFoundException('Presupuesto no encontrado');
    if (budget.status === 'closed') throw new BadRequestException('No se pueden agregar líneas a un presupuesto cerrado');

    const line = this.lineRepo.create({
      budgetId,
      accountCode: data.accountCode,
      accountName: data.accountName,
      month: data.month || null,
      plannedAmount: Number(data.plannedAmount),
      notes: data.notes,
    });
    const saved = await this.lineRepo.save(line);

    // Update total
    budget.totalAmount = Number(budget.totalAmount) + Number(data.plannedAmount);
    await this.budgetRepo.save(budget);

    return saved;
  }

  async approve(companyId: number, id: string, approvedBy: string) {
    const budget = await this.budgetRepo.findOneBy({ id, companyId });
    if (!budget) throw new NotFoundException('Presupuesto no encontrado');

    budget.status = 'approved';
    budget.approvedBy = approvedBy;
    budget.approvedAt = new Date();
    return this.budgetRepo.save(budget);
  }

  async getExecution(companyId: number, id: string) {
    const { budget, lines } = await this.findOne(companyId, id);

    // Calculate actual amounts from voucher lines
    const executionLines: Array<any> = [];
    for (const line of lines) {
      const qb = this.voucherLineRepo
        .createQueryBuilder('vl')
        .select('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
        .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit')
        .innerJoin('vl.voucher', 'v')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.status = :status', { status: 'posted' })
        .andWhere('vl.account_code = :code', { code: line.accountCode });

      // Filter by year
      const yearStart = `${budget.year}-01-01`;
      const yearEnd = `${budget.year}-12-31`;
      qb.andWhere('v.date >= :yearStart', { yearStart });
      qb.andWhere('v.date <= :yearEnd', { yearEnd });

      // Filter by month if specified
      if (line.month) {
        const monthStart = `${budget.year}-${String(line.month).padStart(2, '0')}-01`;
        const lastDay = new Date(budget.year, line.month, 0).getDate();
        const monthEnd = `${budget.year}-${String(line.month).padStart(2, '0')}-${lastDay}`;
        qb.andWhere('v.date >= :monthStart', { monthStart });
        qb.andWhere('v.date <= :monthEnd', { monthEnd });
      }

      const raw = await qb.getRawOne();
      const actualAmount = Number(raw?.totalDebit || 0) - Number(raw?.totalCredit || 0);
      const planned = Number(line.plannedAmount);
      const deviation = actualAmount - planned;
      const executionPct = planned !== 0 ? (actualAmount / planned) * 100 : 0;

      executionLines.push({
        ...line,
        actualAmount,
        deviation,
        executionPercentage: Math.round(executionPct * 100) / 100,
      });
    }

    const totalPlanned = executionLines.reduce((s, l) => s + Number(l.plannedAmount), 0);
    const totalActual = executionLines.reduce((s, l) => s + l.actualAmount, 0);

    return {
      budget,
      lines: executionLines,
      summary: {
        totalPlanned,
        totalActual,
        totalDeviation: totalActual - totalPlanned,
        executionPercentage: totalPlanned !== 0 ? Math.round((totalActual / totalPlanned) * 10000) / 100 : 0,
      },
    };
  }

  async deleteBudget(companyId: number, id: string) {
    const budget = await this.budgetRepo.findOneBy({ id, companyId });
    if (!budget) throw new NotFoundException('Presupuesto no encontrado');
    if (budget.status === 'approved' || budget.status === 'active') {
      throw new BadRequestException('No se puede eliminar un presupuesto aprobado o activo');
    }
    await this.lineRepo.delete({ budgetId: id });
    return this.budgetRepo.remove(budget);
  }
}
