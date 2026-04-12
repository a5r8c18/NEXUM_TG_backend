import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import {
  JournalEntry,
  JournalEntryType } from '../entities/journal-entry.entity';
import { Partida } from '../entities/partida.entity';
import { Elemento } from '../entities/elemento.entity';
import { Account } from '../entities/account.entity';
import { Voucher, SourceModule } from '../entities/voucher.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { FiscalYear } from '../entities/fiscal-year.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { ExpenseType } from '../entities/expense-type.entity';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly journalRepo: Repository<JournalEntry>,
    @InjectRepository(Partida)
    private readonly partidaRepo: Repository<Partida>,
    @InjectRepository(Elemento)
    private readonly elementoRepo: Repository<Elemento>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherLine)
    private readonly voucherLineRepo: Repository<VoucherLine>,
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
    @InjectRepository(FiscalYear)
    private readonly fiscalYearRepo: Repository<FiscalYear>,
    @InjectRepository(AccountingPeriod)
    private readonly periodRepo: Repository<AccountingPeriod>,
    @InjectRepository(ExpenseType)
    private readonly expenseTypeRepo: Repository<ExpenseType>,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── VOUCHERS (Comprobantes de Operación) ──
  // ══════════════════════════════════════════════════════════

  async findAllVouchers(
    companyId: number,
    filters?: {
      status?: string;
      type?: string;
      fromDate?: string;
      toDate?: string;
      sourceModule?: string;
      search?: string;
    },
  ) {
    const qb = this.voucherRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.lines', 'lines')
      .where('v.companyId = :companyId', { companyId });

    if (filters?.status)
      qb.andWhere('v.status = :status', { status: filters.status });
    if (filters?.type)
      qb.andWhere('v.type = :type', { type: filters.type });
    if (filters?.fromDate)
      qb.andWhere('v.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate)
      qb.andWhere('v.date <= :toDate', { toDate: filters.toDate });
    if (filters?.sourceModule)
      qb.andWhere('v.source_module = :sourceModule', {
        sourceModule: filters.sourceModule,
      });
    if (filters?.search)
      qb.andWhere(
        '(v.description ILIKE :search OR v.voucher_number ILIKE :search OR v.reference ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('v.date', 'DESC').addOrderBy('v.voucher_number', 'DESC');
    return qb.getMany();
  }

  async findOneVoucher(companyId: number, id: string) {
    const voucher = await this.voucherRepo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.costCenter'],
    });
    if (!voucher)
      throw new NotFoundException(`Comprobante #${id} no encontrado`);
    return voucher;
  }

  async findVouchersBySourceDocumentId(companyId: number, sourceDocumentId: string) {
    const vouchers = await this.voucherRepo.find({
      where: { companyId, sourceDocumentId },
      relations: ['lines'],
      order: { createdAt: 'ASC' },
    });
    return vouchers;
  }

  async createVoucher(
    companyId: number,
    data: {
      date: string;
      description: string;
      type?: string;
      reference?: string;
      sourceModule?: string;
      sourceDocumentId?: string;
      createdBy?: string;
      lines: {
        accountId: string;
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
        description?: string;
        costCenterId?: string;
        reference?: string;
      }[];
    },
  ) {
    // Validar que tenga al menos 2 líneas
    if (!data.lines || data.lines.length < 2) {
      throw new BadRequestException(
        'Un comprobante debe tener al menos 2 partidas (líneas)',
      );
    }

    // Validar partida doble: SUM(debit) === SUM(credit)
    const totalDebit = data.lines.reduce(
      (sum, l) => sum + Number(l.debit || 0),
      0,
    );
    const totalCredit = data.lines.reduce(
      (sum, l) => sum + Number(l.credit || 0),
      0,
    );
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `Partida doble no cuadra: Débito (${totalDebit.toFixed(2)}) ≠ Crédito (${totalCredit.toFixed(2)})`,
      );
    }

    // Validar que cada línea tenga solo debit o credit (no ambos > 0)
    for (const line of data.lines) {
      if (Number(line.debit) > 0 && Number(line.credit) > 0) {
        throw new BadRequestException(
          `La partida de cuenta ${line.accountCode} no puede tener débito y crédito simultáneamente`,
        );
      }
    }

    // Generar número de comprobante
    const count = await this.voucherRepo.count({ where: { companyId } });
    const voucherNumber = `COP-${String(count + 1).padStart(5, '0')}`;

    const voucher = this.voucherRepo.create({
      companyId,
      voucherNumber,
      date: data.date,
      description: data.description,
      type: (data.type as any) || 'otro',
      status: 'draft',
      totalAmount: totalDebit,
      sourceModule: (data.sourceModule as SourceModule) || 'manual',
      sourceDocumentId: data.sourceDocumentId || null,
      reference: data.reference || null,
      createdBy: data.createdBy || null,
      lines: data.lines.map((line, index) =>
        this.voucherLineRepo.create({
          accountId: line.accountId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          debit: line.debit || 0,
          credit: line.credit || 0,
          description: line.description || null,
          costCenterId: line.costCenterId || null,
          reference: line.reference || null,
          lineOrder: index + 1,
        }),
      ),
    });

    const saved = await this.voucherRepo.save(voucher);

    // Si se publica directamente, actualizar saldos
    if (data.type === 'apertura') {
      await this.postVoucher(companyId, saved.id);
    }

    return saved;
  }

  async updateVoucherStatus(companyId: number, id: string, status: string) {
    const voucher = await this.findOneVoucher(companyId, id);

    if (voucher.status === 'posted' && status !== 'cancelled') {
      throw new BadRequestException(
        'Un comprobante contabilizado solo puede ser anulado',
      );
    }

    if (status === 'posted') {
      return this.postVoucher(companyId, id);
    }

    if (status === 'cancelled' && voucher.status === 'posted') {
      // Revertir saldos
      await this.reverseVoucherBalances(voucher);
    }

    voucher.status = status as any;
    return this.voucherRepo.save(voucher);
  }

  private async postVoucher(companyId: number, id: string) {
    const voucher = await this.findOneVoucher(companyId, id);

    // Actualizar saldos de cuentas
    for (const line of voucher.lines) {
      const account = await this.accountRepo.findOneBy({
        id: line.accountId,
        companyId,
      });
      if (account) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        // Naturaleza deudora: saldo aumenta con débito, disminuye con crédito
        // Naturaleza acreedora: saldo aumenta con crédito, disminuye con débito
        if (account.nature === 'deudora') {
          account.balance = Number(account.balance) + debit - credit;
        } else {
          account.balance = Number(account.balance) + credit - debit;
        }
        await this.accountRepo.save(account);
      }
    }

    voucher.status = 'posted';
    return this.voucherRepo.save(voucher);
  }

  private async reverseVoucherBalances(voucher: Voucher) {
    for (const line of voucher.lines) {
      const account = await this.accountRepo.findOneBy({
        id: line.accountId,
      });
      if (account) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (account.nature === 'deudora') {
          account.balance = Number(account.balance) - debit + credit;
        } else {
          account.balance = Number(account.balance) - credit + debit;
        }
        await this.accountRepo.save(account);
      }
    }
  }

  async deleteVoucher(companyId: number, id: string) {
    const voucher = await this.findOneVoucher(companyId, id);
    if (voucher.status === 'posted') {
      throw new BadRequestException(
        'No se puede eliminar un comprobante contabilizado. Anúlelo primero.',
      );
    }
    await this.voucherRepo.remove(voucher);
    return { message: 'Comprobante eliminado correctamente' };
  }

  async getVoucherStatistics(companyId: number) {
    const vouchers = await this.voucherRepo.find({ where: { companyId } });
    const totalAmount = vouchers
      .filter((v) => v.status === 'posted')
      .reduce((sum, v) => sum + Number(v.totalAmount), 0);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const v of vouchers) {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      byType[v.type] = (byType[v.type] || 0) + 1;
      bySource[v.sourceModule] = (bySource[v.sourceModule] || 0) + 1;
    }

    return {
      total: vouchers.length,
      totalAmount,
      byStatus,
      byType,
      bySource,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── VOUCHER LINES (Partidas) ──
  // ══════════════════════════════════════════════════════════

  async findAllVoucherLines(
    companyId: number,
    filters?: {
      accountCode?: string;
      costCenterId?: string;
      fromDate?: string;
      toDate?: string;
      voucherId?: string;
      search?: string;
    },
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoinAndSelect('vl.voucher', 'v')
      .leftJoinAndSelect('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId });

    if (filters?.accountCode)
      qb.andWhere('vl.account_code = :accountCode', {
        accountCode: filters.accountCode,
      });
    if (filters?.costCenterId)
      qb.andWhere('vl.cost_center_id = :costCenterId', {
        costCenterId: filters.costCenterId,
      });
    if (filters?.fromDate)
      qb.andWhere('v.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate)
      qb.andWhere('v.date <= :toDate', { toDate: filters.toDate });
    if (filters?.voucherId)
      qb.andWhere('vl.voucher_id = :voucherId', {
        voucherId: filters.voucherId,
      });
    if (filters?.search)
      qb.andWhere(
        '(vl.account_name ILIKE :search OR vl.account_code ILIKE :search OR vl.description ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('v.date', 'DESC').addOrderBy('vl.line_order', 'ASC');
    return qb.getMany();
  }

  async getVoucherLineStatistics(companyId: number) {
    const lines = await this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .getMany();

    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0);

    return {
      totalLines: lines.length,
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── COST CENTERS (Centros de Costo) ──
  // ══════════════════════════════════════════════════════════

  async findAllCostCenters(
    companyId: number,
    filters?: {
      type?: string;
      search?: string;
      activeOnly?: string;
    },
  ) {
    const qb = this.costCenterRepo
      .createQueryBuilder('cc')
      .where('cc.companyId = :companyId', { companyId });

    if (filters?.type)
      qb.andWhere('cc.type = :type', { type: filters.type });
    if (filters?.activeOnly === 'true')
      qb.andWhere('cc.is_active = true');
    if (filters?.search)
      qb.andWhere(
        '(cc.name ILIKE :search OR cc.code ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('cc.code', 'ASC');
    return qb.getMany();
  }

  async getCostCenterStatistics(companyId: number) {
    const centers = await this.costCenterRepo.find({
      where: { companyId },
    });
    const active = centers.filter((c) => c.isActive);
    const byType: Record<string, number> = {};
    const totalBudget = centers.reduce(
      (sum, c) => sum + Number(c.budget),
      0,
    );

    for (const c of active) {
      byType[c.type] = (byType[c.type] || 0) + 1;
    }

    return {
      total: centers.length,
      active: active.length,
      inactive: centers.length - active.length,
      totalBudget,
      byType,
    };
  }

  async findOneCostCenter(companyId: number, id: string) {
    const center = await this.costCenterRepo.findOneBy({ id, companyId });
    if (!center)
      throw new NotFoundException(`Centro de costo #${id} no encontrado`);
    return center;
  }

  async createCostCenter(companyId: number, data: Partial<CostCenter>) {
    const existing = await this.costCenterRepo.findOneBy({
      code: data.code,
      companyId,
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un centro de costo con el código ${data.code}`,
      );
    }

    const center = this.costCenterRepo.create({ ...data, companyId });
    return this.costCenterRepo.save(center);
  }

  async updateCostCenter(
    companyId: number,
    id: string,
    data: Partial<CostCenter>,
  ) {
    const center = await this.findOneCostCenter(companyId, id);
    Object.assign(center, data);
    return this.costCenterRepo.save(center);
  }

  async deleteCostCenter(companyId: number, id: string) {
    const center = await this.findOneCostCenter(companyId, id);

    // Verificar que no tenga partidas asociadas
    const usedInLines = await this.voucherLineRepo.findOneBy({
      costCenterId: id,
    });
    if (usedInLines) {
      throw new BadRequestException(
        'No se puede eliminar: el centro de costo tiene partidas contables asociadas',
      );
    }

    await this.costCenterRepo.remove(center);
    return { message: 'Centro de costo eliminado correctamente' };
  }

  // ══════════════════════════════════════════════════════════
  // ── FISCAL YEARS (Años Fiscales) ──
  // ══════════════════════════════════════════════════════════

  async findAllFiscalYears(companyId: number) {
    return this.fiscalYearRepo.find({
      where: { companyId },
      relations: ['periods'],
      order: { startDate: 'DESC' },
    });
  }

  async findOneFiscalYear(companyId: number, id: string) {
    const fy = await this.fiscalYearRepo.findOne({
      where: { id, companyId },
      relations: ['periods'],
    });
    if (!fy) throw new NotFoundException(`Año fiscal #${id} no encontrado`);
    return fy;
  }

  async createFiscalYear(
    companyId: number,
    data: { name: string; startDate: string; endDate: string },
  ) {
    // Verificar que no se traslape con otro año fiscal
    const overlapping = await this.fiscalYearRepo
      .createQueryBuilder('fy')
      .where('fy.companyId = :companyId', { companyId })
      .andWhere('fy.status = :status', { status: 'open' })
      .andWhere(
        '(fy.start_date <= :endDate AND fy.end_date >= :startDate)',
        { startDate: data.startDate, endDate: data.endDate },
      )
      .getOne();

    if (overlapping) {
      throw new BadRequestException(
        `El período se traslapa con el año fiscal "${overlapping.name}"`,
      );
    }

    const fy = this.fiscalYearRepo.create({
      companyId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'open',
    });

    const savedFy = await this.fiscalYearRepo.save(fy);

    // Crear 12 períodos mensuales automáticamente
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    const periods: AccountingPeriod[] = [];
    const current = new Date(start);
    while (current <= end) {
      const m = current.getMonth();
      const y = current.getFullYear();
      const lastDay = new Date(y, m + 1, 0).getDate();
      const periodStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const periodEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      periods.push(
        this.periodRepo.create({
          companyId,
          fiscalYearId: savedFy.id,
          name: `${months[m]} ${y}`,
          month: m + 1,
          year: y,
          startDate: periodStart,
          endDate: periodEnd,
          status: 'open',
        }),
      );

      current.setMonth(current.getMonth() + 1);
    }

    await this.periodRepo.save(periods);

    return this.findOneFiscalYear(companyId, savedFy.id);
  }

  async closeFiscalYear(companyId: number, id: string) {
    const fy = await this.findOneFiscalYear(companyId, id);

    // Cerrar todos los períodos abiertos
    for (const period of fy.periods) {
      if (period.status === 'open') {
        period.status = 'closed';
        period.closedAt = new Date();
        await this.periodRepo.save(period);
      }
    }

    fy.status = 'closed';
    return this.fiscalYearRepo.save(fy);
  }

  // ══════════════════════════════════════════════════════════
  // ── ACCOUNTING PERIODS (Períodos Contables) ──
  // ══════════════════════════════════════════════════════════

  async findAllPeriods(companyId: number, fiscalYearId?: string) {
    const where: any = { companyId };
    if (fiscalYearId) where.fiscalYearId = fiscalYearId;
    return this.periodRepo.find({ where, order: { year: 'ASC', month: 'ASC' } });
  }

  async closePeriod(companyId: number, id: string, closedBy: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period)
      throw new NotFoundException(`Período #${id} no encontrado`);
    if (period.status === 'closed')
      throw new BadRequestException('El período ya está cerrado');

    period.status = 'closed';
    period.closedAt = new Date();
    period.closedBy = closedBy;
    return this.periodRepo.save(period);
  }

  async reopenPeriod(companyId: number, id: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period)
      throw new NotFoundException(`Período #${id} no encontrado`);

    period.status = 'open';
    period.closedAt = null;
    period.closedBy = null;
    return this.periodRepo.save(period);
  }

  // ══════════════════════════════════════════════════════════
  // ── INTER-MODULE INTEGRATION (Fase 2) ──
  // ══════════════════════════════════════════════════════════

  async createVoucherFromModule(
    companyId: number,
    source: SourceModule,
    sourceDocumentId: string,
    data: {
      date: string;
      description: string;
      type: string;
      reference?: string;
      createdBy?: string;
      lines: {
        accountCode: string;
        debit: number;
        credit: number;
        description?: string;
        costCenterId?: string;
      }[];
    },
  ) {
    // Resolver accountId y accountName desde accountCode
    const resolvedLines: {
      accountId: string;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      description?: string;
      costCenterId?: string;
    }[] = [];
    for (const line of data.lines) {
      const account = await this.accountRepo.findOneBy({
        code: line.accountCode,
        companyId,
      });
      if (!account) {
        throw new BadRequestException(
          `Cuenta contable ${line.accountCode} no encontrada para esta empresa`,
        );
      }
      resolvedLines.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        costCenterId: line.costCenterId,
      });
    }

    return this.createVoucher(companyId, {
      date: data.date,
      description: data.description,
      type: data.type,
      reference: data.reference,
      sourceModule: source,
      sourceDocumentId,
      createdBy: data.createdBy || 'Sistema',
      lines: resolvedLines,
    });
  }

  // ══════════════════════════════════════════════════════════
  // ── REPORTS (Informes Contables - Fase 3) ──
  // ══════════════════════════════════════════════════════════

  async getTrialBalance(companyId: number, fromDate?: string, toDate?: string) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('vl.account_code', 'accountCode')
      .addSelect('vl.account_name', 'accountName')
      .addSelect('SUM(vl.debit)', 'totalDebit')
      .addSelect('SUM(vl.credit)', 'totalCredit')
      .addSelect('SUM(vl.debit) - SUM(vl.credit)', 'balance')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.groupBy('vl.account_code')
      .addGroupBy('vl.account_name')
      .orderBy('vl.account_code', 'ASC');

    return qb.getRawMany();
  }

  async getBalanceSheet(companyId: number, asOfDate?: string) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('a.type', 'accountType')
      .addSelect('vl.account_code', 'accountCode')
      .addSelect('vl.account_name', 'accountName')
      .addSelect('SUM(vl.debit) - SUM(vl.credit)', 'balance')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('a.type IN (:...types)', {
        types: ['asset', 'liability', 'equity'],
      });

    if (asOfDate) qb.andWhere('v.date <= :asOfDate', { asOfDate });

    const rows = await qb
      .groupBy('a.type')
      .addGroupBy('vl.account_code')
      .addGroupBy('vl.account_name')
      .orderBy('a.type', 'ASC')
      .addOrderBy('vl.account_code', 'ASC')
      .getRawMany();

    const assets = rows.filter((r: any) => r.accountType === 'asset');
    const liabilities = rows.filter(
      (r: any) => r.accountType === 'liability',
    );
    const equity = rows.filter((r: any) => r.accountType === 'equity');

    const totalAssets = assets.reduce(
      (sum: number, r: any) => sum + Number(r.balance),
      0,
    );
    const totalLiabilities = liabilities.reduce(
      (sum: number, r: any) => sum + Math.abs(Number(r.balance)),
      0,
    );
    const totalEquity = equity.reduce(
      (sum: number, r: any) => sum + Math.abs(Number(r.balance)),
      0,
    );

    return {
      assets: { items: assets, total: totalAssets },
      liabilities: { items: liabilities, total: totalLiabilities },
      equity: { items: equity, total: totalEquity },
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  async getIncomeStatement(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('a.type', 'accountType')
      .addSelect('vl.account_code', 'accountCode')
      .addSelect('vl.account_name', 'accountName')
      .addSelect('SUM(vl.debit)', 'totalDebit')
      .addSelect('SUM(vl.credit)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('a.type IN (:...types)', {
        types: ['income', 'expense'],
      });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    const rows = await qb
      .groupBy('a.type')
      .addGroupBy('vl.account_code')
      .addGroupBy('vl.account_name')
      .orderBy('a.type', 'ASC')
      .addOrderBy('vl.account_code', 'ASC')
      .getRawMany();

    const incomeRows = rows.filter((r: any) => r.accountType === 'income');
    const expenseRows = rows.filter((r: any) => r.accountType === 'expense');

    const totalIncome = incomeRows.reduce(
      (sum: number, r: any) => sum + Math.abs(Number(r.totalCredit) - Number(r.totalDebit)),
      0,
    );
    const totalExpenses = expenseRows.reduce(
      (sum: number, r: any) => sum + Math.abs(Number(r.totalDebit) - Number(r.totalCredit)),
      0,
    );

    return {
      income: { items: incomeRows, total: totalIncome },
      expenses: { items: expenseRows, total: totalExpenses },
      netProfit: totalIncome - totalExpenses,
    };
  }

  async getGeneralLedger(
    companyId: number,
    accountCode: string,
    fromDate?: string,
    toDate?: string,
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoinAndSelect('vl.voucher', 'v')
      .leftJoinAndSelect('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.account_code = :accountCode', { accountCode });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    const lines = await qb
      .orderBy('v.date', 'ASC')
      .addOrderBy('v.voucher_number', 'ASC')
      .getMany();

    // Calcular saldo acumulado
    let runningBalance = 0;
    const account = await this.accountRepo.findOneBy({
      code: accountCode,
      companyId,
    });
    const isDeudora = account?.nature === 'deudora';

    const entries = lines.map((l) => {
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      if (isDeudora) {
        runningBalance += debit - credit;
      } else {
        runningBalance += credit - debit;
      }
      return {
        ...l,
        runningBalance,
      };
    });

    return {
      accountCode,
      accountName: account?.name || accountCode,
      nature: account?.nature || 'deudora',
      entries,
      finalBalance: runningBalance,
    };
  }

  async getGeneralJournal(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    return this.findAllVouchers(companyId, {
      status: 'posted',
      fromDate,
      toDate,
    });
  }

  async getCostCenterAnalysis(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('cc.code', 'costCenterCode')
      .addSelect('cc.name', 'costCenterName')
      .addSelect('SUM(vl.debit)', 'totalDebit')
      .addSelect('SUM(vl.credit)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    return qb
      .groupBy('cc.code')
      .addGroupBy('cc.name')
      .orderBy('cc.code', 'ASC')
      .getRawMany();
  }

  // ══════════════════════════════════════════════════════════
  // ── ELEMENTOS (Agrupación de Cuentas por Tipo) ──
  // ══════════════════════════════════════════════════════════

  async getAccountElements(companyId: number) {
    const accounts = await this.accountRepo.find({
      where: { companyId },
      order: { code: 'ASC' },
    });

    // Agrupar por tipo (asset, liability, equity, income, expense)
    const elements: Record<string, {
      type: string;
      label: string;
      nature: string;
      accountCount: number;
      activeCount: number;
      totalBalance: number;
      accounts: any[];
    }> = {};

    const typeLabels: Record<string, string> = {
      asset: 'Activos',
      liability: 'Pasivos',
      equity: 'Patrimonio',
      income: 'Ingresos',
      expense: 'Gastos',
    };

    const typeNature: Record<string, string> = {
      asset: 'deudora',
      liability: 'acreedora',
      equity: 'acreedora',
      income: 'acreedora',
      expense: 'deudora',
    };

    for (const a of accounts) {
      if (!elements[a.type]) {
        elements[a.type] = {
          type: a.type,
          label: typeLabels[a.type] || a.type,
          nature: typeNature[a.type] || 'deudora',
          accountCount: 0,
          activeCount: 0,
          totalBalance: 0,
          accounts: [],
        };
      }
      elements[a.type].accountCount++;
      if (a.isActive) elements[a.type].activeCount++;
      elements[a.type].totalBalance += Number(a.balance);
      elements[a.type].accounts.push(a);
    }

    return Object.values(elements);
  }

  // ══════════════════════════════════════════════════════════
  // ── LEGACY: Journal Entries (backward compatibility) ──
  // ══════════════════════════════════════════════════════════

  async findAllEntries(companyId: number, filters?: {
    status?: string;
    fromDate?: string;
    toDate?: string;
    accountCode?: string;
  }) {
    const qb = this.journalRepo.createQueryBuilder('je')
      .where('je.companyId = :companyId', { companyId });

    if (filters?.status) qb.andWhere('je.status = :status', { status: filters.status });
    if (filters?.fromDate) qb.andWhere('je.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate) qb.andWhere('je.date <= :toDate', { toDate: filters.toDate });
    if (filters?.accountCode) qb.andWhere('je.accountCode = :accountCode', { accountCode: filters.accountCode });

    qb.orderBy('je.date', 'DESC');
    return qb.getMany();
  }

  async findOneEntry(companyId: number, id: string) {
    const entry = await this.journalRepo.findOneBy({ id, companyId });
    if (!entry) throw new NotFoundException(`Asiento #${id} no encontrado`);
    return entry;
  }

  async createEntry(companyId: number, data: Partial<JournalEntry>) {
    const count = await this.journalRepo.count({ where: { companyId } });
    const entry = this.journalRepo.create({
      ...data,
      companyId,
      entryNumber: `AST-${String(count + 1).padStart(5, '0')}`,
      status: 'draft',
    });
    return this.journalRepo.save(entry);
  }

  async updateEntryStatus(companyId: number, id: string, status: string) {
    const entry = await this.findOneEntry(companyId, id);
    entry.status = status as any;
    return this.journalRepo.save(entry);
  }

  async deleteEntry(companyId: number, id: string) {
    const entry = await this.findOneEntry(companyId, id);
    await this.journalRepo.remove(entry);
    return { message: 'Asiento eliminado correctamente' };
  }

  async getEntryStatistics(companyId: number) {
    const entries = await this.journalRepo.find({ where: { companyId } });
    const totalDebit = entries.reduce((sum, e) => sum + Number(e.debit), 0);
    const totalCredit = entries.reduce((sum, e) => sum + Number(e.credit), 0);
    return {
      totalEntries: entries.length,
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
      byStatus: {
        draft: entries.filter(e => e.status === 'draft').length,
        posted: entries.filter(e => e.status === 'posted').length,
        cancelled: entries.filter(e => e.status === 'cancelled').length,
      },
    };
  }

  async getAccountingStatistics(companyId: number) {
    const [accounts, vouchers, costCenters] = await Promise.all([
      this.accountRepo.find({ where: { companyId } }),
      this.voucherRepo.find({ where: { companyId } }),
      this.costCenterRepo.find({ where: { companyId } }),
    ]);

    return {
      totalAccounts: accounts.length,
      totalVouchers: vouchers.length,
      totalCostCenters: costCenters.length,
      activeVouchers: vouchers.filter(v => v.status === 'posted').length,
      draftVouchers: vouchers.filter(v => v.status === 'draft').length,
    };
  }

  async getFinancialKPIs(companyId: number) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const lastYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    // Get vouchers for current and last month
    const [currentMonthVouchers, lastMonthVouchers] = await Promise.all([
      this.findAllVouchers(companyId, {
        fromDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
        toDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`,
      }),
      this.findAllVouchers(companyId, {
        fromDate: `${lastYear}-${String(lastMonth).padStart(2, '0')}-01`,
        toDate: `${lastYear}-${String(lastMonth).padStart(2, '0')}-31`,
      }),
    ]);

    // Get all accounts for balance calculations
    const accounts = await this.accountRepo.find({ 
      where: { companyId },
      relations: ['voucherLines'],
    });

    // Calculate current month totals by account type
    const currentMonthTotals = currentMonthVouchers.reduce(
      (acc, voucher) => {
        voucher.lines.forEach(line => {
          const account = accounts.find(a => a.id === line.accountId);
          if (account) {
            if (account.type === 'asset' || account.type === 'expense') {
              acc.debits += Number(line.debit || 0);
            } else {
              acc.credits += Number(line.credit || 0);
            }
          }
        });
        return acc;
      },
      { debits: 0, credits: 0 }
    );

    // Calculate last month totals
    const lastMonthTotals = lastMonthVouchers.reduce(
      (acc, voucher) => {
        voucher.lines.forEach(line => {
          const account = accounts.find(a => a.id === line.accountId);
          if (account) {
            if (account.type === 'asset' || account.type === 'expense') {
              acc.debits += Number(line.debit || 0);
            } else {
              acc.credits += Number(line.credit || 0);
            }
          }
        });
        return acc;
      },
      { debits: 0, credits: 0 }
    );

    // Calculate account balances
    const assetAccounts = accounts.filter(a => a.type === 'asset');
    const liabilityAccounts = accounts.filter(a => a.type === 'liability');
    const equityAccounts = accounts.filter(a => a.type === 'equity');
    const revenueAccounts = accounts.filter(a => a.type === 'income');
    const expenseAccounts = accounts.filter(a => a.type === 'expense');

    const totalAssets = assetAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const totalEquity = equityAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const totalExpenses = expenseAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

    const netIncome = totalRevenue - totalExpenses;

    // Calculate trends
    const revenueTrend = lastMonthTotals.credits > 0 
      ? ((currentMonthTotals.credits - lastMonthTotals.credits) / lastMonthTotals.credits) * 100 
      : 0;
    const expenseTrend = lastMonthTotals.debits > 0 
      ? ((currentMonthTotals.debits - lastMonthTotals.debits) / lastMonthTotals.debits) * 100 
      : 0;

    return {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpenses,
      netIncome,
      currentMonthRevenue: currentMonthTotals.credits,
      currentMonthExpenses: currentMonthTotals.debits,
      revenueTrend,
      expenseTrend,
      totalVouchers: currentMonthVouchers.length + lastMonthVouchers.length,
      currentMonthVouchers: currentMonthVouchers.length,
    };
  }

  // Export methods
  async exportTrialBalanceExcel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const data = await this.getTrialBalance(companyId, fromDate, toDate);
    
    const ws = XLSX.utils.json_to_sheet(data.map((item: any) => ({
      'Código': item.accountCode,
      'Cuenta': item.accountName,
      'Tipo': item.accountType,
      'Naturaleza': item.accountNature,
      'Débitos': item.totalDebit,
      'Créditos': item.totalCredit,
      'Saldo': item.balance,
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance de Comprobación');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    if (res) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=balance-comprobacion.xlsx');
      res.send(buffer);
    }
    
    return buffer;
  }

  async exportTrialBalancePDF(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    // Simple PDF implementation - for now return placeholder
    const html = `
      <html>
        <body>
          <h1>Balance de Comprobación</h1>
          <p>Período: ${fromDate || 'Inicio'} - ${toDate || 'Fin'}</p>
          <table border="1">
            <tr><th>Código</th><th>Cuenta</th><th>Débitos</th><th>Créditos</th><th>Saldo</th></tr>
            <!-- Data would be populated here -->
          </table>
        </body>
      </html>
    `;
    
    if (res) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=balance-comprobacion.pdf');
      res.send(Buffer.from('PDF placeholder for trial balance'));
    }
    
    return Buffer.from('PDF placeholder');
  }

  async exportBalanceSheetExcel(
    companyId: number,
    asOfDate?: string,
    res?: Response,
  ) {
    const data = await this.getBalanceSheet(companyId, asOfDate);
    
    const ws = XLSX.utils.json_to_sheet([
      ...data.assets.items.map((item: any) => ({
        'Categoría': 'Activo',
        'Subcategoría': item.category,
        'Cuenta': item.accountName,
        'Saldo': item.balance,
      })),
      ...data.liabilities.items.map((item: any) => ({
        'Categoría': 'Pasivo',
        'Subcategoría': item.category,
        'Cuenta': item.accountName,
        'Saldo': item.balance,
      })),
      ...data.equity.items.map((item: any) => ({
        'Categoría': 'Patrimonio',
        'Subcategoría': item.category,
        'Cuenta': item.accountName,
        'Saldo': item.balance,
      })),
    ]);
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance General');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    if (res) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=balance-general.xlsx');
      res.send(buffer);
    }
    
    return buffer;
  }

  async exportBalanceSheetPDF(
    companyId: number,
    asOfDate?: string,
    res?: Response,
  ) {
    if (res) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=balance-general.pdf');
      res.send(Buffer.from('PDF placeholder for balance sheet'));
    }
    
    return Buffer.from('PDF placeholder');
  }

  async exportIncomeStatementExcel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const data = await this.getIncomeStatement(companyId, fromDate, toDate);
    
    const ws = XLSX.utils.json_to_sheet([
      ...data.income.items.map((item: any) => ({
        'Tipo': 'Ingreso',
        'Categoría': item.category,
        'Cuenta': item.accountName,
        'Monto': item.amount,
      })),
      ...data.expenses.items.map((item: any) => ({
        'Tipo': 'Gasto',
        'Categoría': item.category,
        'Cuenta': item.accountName,
        'Monto': item.amount,
      })),
    ]);
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estado de Resultados');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    if (res) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=estado-resultados.xlsx');
      res.send(buffer);
    }
    
    return buffer;
  }

  async exportIncomeStatementPDF(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    if (res) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=estado-resultados.pdf');
      res.send(Buffer.from('PDF placeholder for income statement'));
    }
    
    return Buffer.from('PDF placeholder');
  }

  // ── Accounts (Chart of Accounts) ──

  async findAllAccounts(
    companyId: number,
    filters?: {
      type?: string;
      search?: string;
      nature?: string;
      level?: string;
      groupNumber?: string;
      activeOnly?: string;
      allowsMovements?: string;
    },
  ) {
    const qb = this.accountRepo.createQueryBuilder('acc');

    qb.where('acc.companyId = :companyId', { companyId });

    if (filters?.type) qb.andWhere('acc.type = :type', { type: filters.type });
    if (filters?.search)
      qb.andWhere('(acc.code ILIKE :search OR acc.name ILIKE :search)', { search: `%${filters.search}%` });
    if (filters?.nature) qb.andWhere('acc.nature = :nature', { nature: filters.nature });
    if (filters?.level) qb.andWhere('acc.level = :level', { level: parseInt(filters.level) });
    if (filters?.groupNumber) qb.andWhere('acc.groupNumber = :groupNumber', { groupNumber: filters.groupNumber });
    if (filters?.activeOnly === 'true') qb.andWhere('acc.isActive = true');
    if (filters?.allowsMovements === 'true') qb.andWhere('acc.allowsMovements = true');

    qb.orderBy('acc.code', 'ASC');
    return qb.getMany();
  }

  async findAccountsByParentCode(companyId: number, parentCode: string) {
    return this.accountRepo.find({
      where: {
        companyId,
        parentCode,
        isActive: true,
        allowsMovements: true
      },
      order: {
        code: 'ASC'
      }
    });
  }

  async getAccountStatistics(companyId: number) {
    const accounts = await this.accountRepo.find({ where: { companyId } });
    const active = accounts.filter(a => a.isActive);
    const byType: Record<string, number> = {};
    const byNature: Record<string, number> = {};
    const byLevel: Record<number, number> = {};

    for (const a of active) {
      byType[a.type] = (byType[a.type] || 0) + 1;
      byNature[a.nature] = (byNature[a.nature] || 0) + 1;
      byLevel[a.level] = (byLevel[a.level] || 0) + 1;
    }

    return {
      total: accounts.length,
      active: active.length,
      inactive: accounts.length - active.length,
      byType,
      byNature,
      byLevel,
    };
  }

  async createAccount(companyId: number, data: Partial<Account>) {
    const existing = await this.accountRepo.findOneBy({ code: data.code, companyId });
    if (existing) {
      throw new BadRequestException(`Ya existe una cuenta con el código ${data.code}`);
    }

    const account = this.accountRepo.create({ ...data, companyId });
    return this.accountRepo.save(account);
  }

  async updateAccount(companyId: number, id: string, data: Partial<Account>) {
    const account = await this.accountRepo.findOneBy({ id, companyId });
    if (!account) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    Object.assign(account, data);
    return this.accountRepo.save(account);
  }

  async deleteAccount(companyId: number, id: string) {
    const account = await this.accountRepo.findOneBy({ id, companyId });
    if (!account) throw new NotFoundException(`Cuenta #${id} no encontrada`);

    const children = await this.accountRepo.findOneBy({ parentCode: account.code, companyId });
    if (children) {
      throw new BadRequestException('No se puede eliminar: la cuenta tiene subcuentas asociadas');
    }

    await this.accountRepo.remove(account);
    return { message: 'Cuenta eliminada correctamente' };
  }

  // ================================
  // JOURNAL ENTRIES (Partidas Independientes)
  // ================================

  async findAllJournalEntries(
    companyId: number,
    filters?: {
      status?: string;
      type?: string;
      fromDate?: string;
      toDate?: string;
      accountCode?: string;
      search?: string;
    },
  ) {
    const qb = this.journalRepo
      .createQueryBuilder('je')
      .leftJoinAndSelect('je.account', 'account')
      .leftJoinAndSelect('je.costCenter', 'costCenter')
      .where('je.companyId = :companyId', { companyId });

    if (filters?.status)
      qb.andWhere('je.status = :status', { status: filters.status });
    if (filters?.type)
      qb.andWhere('je.type = :type', { type: filters.type });
    if (filters?.fromDate)
      qb.andWhere('je.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate)
      qb.andWhere('je.date <= :toDate', { toDate: filters.toDate });
    if (filters?.accountCode)
      qb.andWhere('je.account_code = :accountCode', { accountCode: filters.accountCode });
    if (filters?.search)
      qb.andWhere(
        '(je.description ILIKE :search OR je.entry_number ILIKE :search OR je.reference ILIKE :search OR je.account_name ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('je.date', 'DESC').addOrderBy('je.entry_number', 'DESC');
    return qb.getMany();
  }

  async findOneJournalEntry(companyId: number, id: string) {
    const entry = await this.journalRepo.findOne({
      where: { id, companyId },
      relations: ['account', 'costCenter'],
    });
    if (!entry)
      throw new NotFoundException(`Partida #${id} no encontrada`);
    return entry;
  }

  async createJournalEntry(
    companyId: number,
    data: {
      date?: string;
      description?: string;
      accountCode: string;
      subaccountCode?: string;
      entryNumber?: string;
      element?: string;
      elementDescription?: string;
      debit?: number;
      credit?: number;
      lineDescription?: string;
      costCenterId?: string;
      reference?: string;
      type?: string;
      createdBy?: string;
    },
  ) {
    // Validar que exista la cuenta
    const account = await this.accountRepo.findOneBy({
      code: data.accountCode,
      companyId,
    });
    if (!account) {
      throw new NotFoundException(`Cuenta ${data.accountCode} no encontrada`);
    }

    // Buscar subcuenta si se proporcionó
    let subaccountName: string | null = null;
    if (data.subaccountCode) {
      const subaccount = await this.accountRepo.findOneBy({
        code: data.subaccountCode,
        companyId,
      });
      subaccountName = subaccount?.name || null;
    }

    // Usar entryNumber personalizado o generar uno automático
    let entryNumber = data.entryNumber;
    if (!entryNumber) {
      const today = new Date().toISOString().split('T')[0];
      const count = await this.journalRepo.count({
        where: {
          companyId,
          date: today,
        },
      });
      entryNumber = `JE-${today.replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;
    }

    const entry = new JournalEntry();
    entry.companyId = companyId;
    entry.entryNumber = entryNumber;
    entry.date = data.date || new Date().toISOString().split('T')[0];
    entry.description = data.description || entryNumber;
    entry.accountId = account.id;
    entry.accountCode = account.code;
    entry.accountName = account.name;
    entry.subaccountCode = data.subaccountCode || null;
    entry.subaccountName = subaccountName;
    entry.element = data.element || null;
    entry.elementDescription = data.elementDescription || null;
    entry.debit = data.debit || 0;
    entry.credit = data.credit || 0;
    entry.lineDescription = data.lineDescription || null;
    entry.costCenterId = data.costCenterId || null;
    entry.reference = data.reference || null;
    entry.type = (data.type as JournalEntryType) || 'manual';
    entry.createdBy = data.createdBy || null;

    return this.journalRepo.save(entry);
  }

  async updateJournalEntry(
    companyId: number,
    id: string,
    data: {
      date?: string;
      description?: string;
      accountCode?: string;
      subaccountCode?: string;
      entryNumber?: string;
      element?: string;
      elementDescription?: string;
      debit?: number;
      credit?: number;
      lineDescription?: string;
      costCenterId?: string;
      reference?: string;
    },
  ) {
    const entry = await this.findOneJournalEntry(companyId, id);

    // No permitir editar si ya está contabilizada
    if (entry.status === 'posted') {
      throw new BadRequestException('No se puede editar una partida contabilizada');
    }

    if (data.accountCode) {
      const account = await this.accountRepo.findOneBy({
        code: data.accountCode,
        companyId,
      });
      if (account) {
        entry.accountId = account.id;
        entry.accountCode = account.code;
        entry.accountName = account.name;
      }
    }

    if (data.subaccountCode !== undefined) {
      entry.subaccountCode = data.subaccountCode || null;
      if (data.subaccountCode) {
        const subaccount = await this.accountRepo.findOneBy({
          code: data.subaccountCode,
          companyId,
        });
        entry.subaccountName = subaccount?.name || null;
      } else {
        entry.subaccountName = null;
      }
    }

    if (data.entryNumber) entry.entryNumber = data.entryNumber;
    if (data.date) entry.date = data.date;
    if (data.description) entry.description = data.description;
    if (data.element !== undefined) entry.element = data.element || null;
    if (data.elementDescription !== undefined) entry.elementDescription = data.elementDescription || null;
    if (data.debit !== undefined) entry.debit = data.debit;
    if (data.credit !== undefined) entry.credit = data.credit;
    if (data.lineDescription !== undefined) entry.lineDescription = data.lineDescription;
    if (data.costCenterId !== undefined) entry.costCenterId = data.costCenterId;
    if (data.reference !== undefined) entry.reference = data.reference;

    return this.journalRepo.save(entry);
  }

  async deleteJournalEntry(companyId: number, id: string) {
    const entry = await this.findOneJournalEntry(companyId, id);

    // No permitir eliminar si ya está contabilizada
    if (entry.status === 'posted') {
      throw new BadRequestException('No se puede eliminar una partida contabilizada');
    }

    await this.journalRepo.remove(entry);
    return { message: 'Partida eliminada correctamente' };
  }

  async updateJournalEntryStatus(companyId: number, id: string, status: 'posted' | 'cancelled') {
    const entry = await this.findOneJournalEntry(companyId, id);
    entry.status = status;
    return this.journalRepo.save(entry);
  }

  async getJournalEntryStatistics(companyId: number) {
    const stats = await this.journalRepo
      .createQueryBuilder('je')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN je.status = :posted THEN 1 ELSE 0 END)', 'posted')
      .addSelect('SUM(CASE WHEN je.status = :draft THEN 1 ELSE 0 END)', 'draft')
      .addSelect('SUM(CASE WHEN je.status = :cancelled THEN 1 ELSE 0 END)', 'cancelled')
      .addSelect('SUM(je.debit)', 'totalDebit')
      .addSelect('SUM(je.credit)', 'totalCredit')
      .where('je.companyId = :companyId', { companyId })
      .setParameter('posted', 'posted')
      .setParameter('draft', 'draft')
      .setParameter('cancelled', 'cancelled')
      .getRawOne();

    return {
      total: parseInt(stats.total) || 0,
      posted: parseInt(stats.posted) || 0,
      draft: parseInt(stats.draft) || 0,
      cancelled: parseInt(stats.cancelled) || 0,
      totalDebit: parseFloat(stats.totalDebit) || 0,
      totalCredit: parseFloat(stats.totalCredit) || 0,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── PARTIDAS (Partidas de Gastos) ──
  // ══════════════════════════════════════════════════════════

  async findAllPartidas(
    companyId: number,
    filters?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      accountCode?: string;
      search?: string;
    },
  ) {
    const qb = this.partidaRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.account', 'account')
      .leftJoinAndSelect('p.costCenter', 'costCenter')
      .where('p.companyId = :companyId', { companyId });

    if (filters?.status)
      qb.andWhere('p.status = :status', { status: filters.status });
    if (filters?.fromDate)
      qb.andWhere('p.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate)
      qb.andWhere('p.date <= :toDate', { toDate: filters.toDate });
    if (filters?.accountCode)
      qb.andWhere('p.accountCode = :accountCode', { accountCode: filters.accountCode });
    if (filters?.search)
      qb.andWhere(
        '(p.description ILIKE :search OR p.entryNumber ILIKE :search OR p.accountName ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('p.date', 'DESC').addOrderBy('p.entryNumber', 'DESC');
    return qb.getMany();
  }

  async findOnePartida(companyId: number, id: string) {
    const partida = await this.partidaRepo.findOne({
      where: { id, companyId },
      relations: ['account', 'costCenter'],
    });
    if (!partida)
      throw new NotFoundException(`Partida #${id} no encontrada`);
    return partida;
  }

  async createPartida(
    companyId: number,
    data: {
      date?: string;
      description?: string;
      accountCode: string;
      subaccountCode?: string;
      entryNumber?: string;
      debit?: number;
      credit?: number;
      lineDescription?: string;
      costCenterId?: string;
      reference?: string;
      type?: string;
      createdBy?: string;
    },
  ) {
    // Validar que exista la cuenta y que sea de gasto
    const account = await this.accountRepo.findOneBy({
      code: data.accountCode,
      companyId,
    });
    if (!account) {
      throw new NotFoundException(`Cuenta ${data.accountCode} no encontrada`);
    }
    if (account.type !== 'expense') {
      throw new BadRequestException(`La cuenta ${data.accountCode} no es una cuenta de gasto`);
    }

    // Buscar subcuenta si se proporcionó
    let subaccountName: string | null = null;
    if (data.subaccountCode) {
      const subaccount = await this.accountRepo.findOneBy({
        code: data.subaccountCode,
        companyId,
      });
      subaccountName = subaccount?.name || null;
    }

    // Usar entryNumber personalizado o generar uno automático
    let entryNumber = data.entryNumber;
    if (!entryNumber) {
      const today = new Date().toISOString().split('T')[0];
      const count = await this.partidaRepo.count({
        where: {
          companyId,
          date: today,
        },
      });
      entryNumber = `PT-${today.replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;
    }

    const partida = new Partida();
    partida.companyId = companyId;
    partida.entryNumber = entryNumber;
    partida.date = data.date || new Date().toISOString().split('T')[0];
    partida.description = data.description || entryNumber;
    partida.accountId = account.id;
    partida.accountCode = account.code;
    partida.accountName = account.name;
    partida.subaccountCode = data.subaccountCode || null;
    partida.subaccountName = subaccountName;
    partida.debit = data.debit || 0;
    partida.credit = data.credit || 0;
    partida.lineDescription = data.lineDescription || null;
    partida.costCenterId = data.costCenterId || null;
    partida.reference = data.reference || null;
    partida.type = data.type || 'manual';
    partida.createdBy = data.createdBy || null;

    return this.partidaRepo.save(partida);
  }

  async updatePartida(
    companyId: number,
    id: string,
    data: {
      date?: string;
      description?: string;
      accountCode?: string;
      subaccountCode?: string;
      entryNumber?: string;
      debit?: number;
      credit?: number;
      lineDescription?: string;
      costCenterId?: string;
      reference?: string;
    },
  ) {
    const partida = await this.findOnePartida(companyId, id);

    // No permitir editar si ya está contabilizada
    if (partida.status === 'posted') {
      throw new BadRequestException('No se puede editar una partida contabilizada');
    }

    if (data.accountCode) {
      const account = await this.accountRepo.findOneBy({
        code: data.accountCode,
        companyId,
      });
      if (account) {
        if (account.type !== 'expense') {
          throw new BadRequestException(`La cuenta ${data.accountCode} no es una cuenta de gasto`);
        }
        partida.accountId = account.id;
        partida.accountCode = account.code;
        partida.accountName = account.name;
      }
    }

    if (data.subaccountCode !== undefined) {
      partida.subaccountCode = data.subaccountCode || null;
      if (data.subaccountCode) {
        const subaccount = await this.accountRepo.findOneBy({
          code: data.subaccountCode,
          companyId,
        });
        partida.subaccountName = subaccount?.name || null;
      } else {
        partida.subaccountName = null;
      }
    }

    if (data.entryNumber) partida.entryNumber = data.entryNumber;
    if (data.date) partida.date = data.date;
    if (data.description) partida.description = data.description;
    if (data.debit !== undefined) partida.debit = data.debit;
    if (data.credit !== undefined) partida.credit = data.credit;
    if (data.lineDescription !== undefined) partida.lineDescription = data.lineDescription;
    if (data.costCenterId !== undefined) partida.costCenterId = data.costCenterId;
    if (data.reference !== undefined) partida.reference = data.reference;

    return this.partidaRepo.save(partida);
  }

  async deletePartida(companyId: number, id: string) {
    const partida = await this.findOnePartida(companyId, id);

    // No permitir eliminar si ya está contabilizada
    if (partida.status === 'posted') {
      throw new BadRequestException('No se puede eliminar una partida contabilizada');
    }

    await this.partidaRepo.remove(partida);
    return { message: 'Partida eliminada correctamente' };
  }

  async updatePartidaStatus(companyId: number, id: string, status: 'posted' | 'cancelled') {
    const partida = await this.findOnePartida(companyId, id);
    partida.status = status;
    return this.partidaRepo.save(partida);
  }

  async getPartidaStatistics(companyId: number) {
    const stats = await this.partidaRepo
      .createQueryBuilder('p')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN p.status = :posted THEN 1 ELSE 0 END)', 'posted')
      .addSelect('SUM(CASE WHEN p.status = :draft THEN 1 ELSE 0 END)', 'draft')
      .addSelect('SUM(CASE WHEN p.status = :cancelled THEN 1 ELSE 0 END)', 'cancelled')
      .addSelect('SUM(p.debit)', 'totalDebit')
      .addSelect('SUM(p.credit)', 'totalCredit')
      .where('p.companyId = :companyId', { companyId })
      .setParameter('posted', 'posted')
      .setParameter('draft', 'draft')
      .setParameter('cancelled', 'cancelled')
      .getRawOne();

    return {
      total: parseInt(stats.total) || 0,
      posted: parseInt(stats.posted) || 0,
      draft: parseInt(stats.draft) || 0,
      cancelled: parseInt(stats.cancelled) || 0,
      totalDebit: parseFloat(stats.totalDebit) || 0,
      totalCredit: parseFloat(stats.totalCredit) || 0,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── ELEMENTOS (Elementos de Gastos) ──
  // ══════════════════════════════════════════════════════════

  async findAllElementos(
    companyId: number,
    filters?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      accountCode?: string;
      search?: string;
    },
  ) {
    const qb = this.elementoRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.account', 'account')
      .leftJoinAndSelect('e.costCenter', 'costCenter')
      .where('e.companyId = :companyId', { companyId });

    if (filters?.status)
      qb.andWhere('e.status = :status', { status: filters.status });
    if (filters?.fromDate)
      qb.andWhere('e.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate)
      qb.andWhere('e.date <= :toDate', { toDate: filters.toDate });
    if (filters?.accountCode)
      qb.andWhere('e.accountCode = :accountCode', { accountCode: filters.accountCode });
    if (filters?.search)
      qb.andWhere(
        '(e.description ILIKE :search OR e.entryNumber ILIKE :search OR e.accountName ILIKE :search OR e.element ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('e.date', 'DESC').addOrderBy('e.entryNumber', 'DESC');
    return qb.getMany();
  }

  async findOneElemento(companyId: number, id: string) {
    const elemento = await this.elementoRepo.findOne({
      where: { id, companyId },
      relations: ['account', 'costCenter'],
    });
    if (!elemento)
      throw new NotFoundException(`Elemento #${id} no encontrado`);
    return elemento;
  }

  async createElemento(
    companyId: number,
    data: {
      date?: string;
      description?: string;
      accountCode: string;
      subaccountCode?: string;
      entryNumber?: string;
      element: string;
      elementDescription?: string;
      debit?: number;
      credit?: number;
      lineDescription?: string;
      costCenterId?: string;
      reference?: string;
      type?: string;
      createdBy?: string;
    },
  ) {
    // Validar que exista la cuenta y que sea de gasto
    const account = await this.accountRepo.findOneBy({
      code: data.accountCode,
      companyId,
    });
    if (!account) {
      throw new NotFoundException(`Cuenta ${data.accountCode} no encontrada`);
    }
    if (account.type !== 'expense') {
      throw new BadRequestException(`La cuenta ${data.accountCode} no es una cuenta de gasto`);
    }

    // Buscar subcuenta si se proporcionó
    let subaccountName: string | null = null;
    if (data.subaccountCode) {
      const subaccount = await this.accountRepo.findOneBy({
        code: data.subaccountCode,
        companyId,
      });
      subaccountName = subaccount?.name || null;
    }

    // Usar entryNumber personalizado o generar uno automático
    let entryNumber = data.entryNumber;
    if (!entryNumber) {
      const today = new Date().toISOString().split('T')[0];
      const count = await this.elementoRepo.count({
        where: {
          companyId,
          date: today,
        },
      });
      entryNumber = `EL-${today.replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;
    }

    const elemento = new Elemento();
    elemento.companyId = companyId;
    elemento.entryNumber = entryNumber;
    elemento.date = data.date || new Date().toISOString().split('T')[0];
    elemento.description = data.description || entryNumber;
    elemento.accountId = account.id;
    elemento.accountCode = account.code;
    elemento.accountName = account.name;
    elemento.subaccountCode = data.subaccountCode || null;
    elemento.subaccountName = subaccountName;
    elemento.element = data.element;
    elemento.elementDescription = data.elementDescription || null;
    elemento.debit = data.debit || 0;
    elemento.credit = data.credit || 0;
    elemento.lineDescription = data.lineDescription || null;
    elemento.costCenterId = data.costCenterId || null;
    elemento.reference = data.reference || null;
    elemento.type = data.type || 'manual';
    elemento.createdBy = data.createdBy || null;

    return this.elementoRepo.save(elemento);
  }

  async updateElemento(
    companyId: number,
    id: string,
    data: {
      date?: string;
      description?: string;
      accountCode?: string;
      subaccountCode?: string;
      entryNumber?: string;
      element?: string;
      elementDescription?: string;
      debit?: number;
      credit?: number;
      lineDescription?: string;
      costCenterId?: string;
      reference?: string;
    },
  ) {
    const elemento = await this.findOneElemento(companyId, id);

    // No permitir editar si ya está contabilizado
    if (elemento.status === 'posted') {
      throw new BadRequestException('No se puede editar un elemento contabilizado');
    }

    if (data.accountCode) {
      const account = await this.accountRepo.findOneBy({
        code: data.accountCode,
        companyId,
      });
      if (account) {
        if (account.type !== 'expense') {
          throw new BadRequestException(`La cuenta ${data.accountCode} no es una cuenta de gasto`);
        }
        elemento.accountId = account.id;
        elemento.accountCode = account.code;
        elemento.accountName = account.name;
      }
    }

    if (data.subaccountCode !== undefined) {
      elemento.subaccountCode = data.subaccountCode || null;
      if (data.subaccountCode) {
        const subaccount = await this.accountRepo.findOneBy({
          code: data.subaccountCode,
          companyId,
        });
        elemento.subaccountName = subaccount?.name || null;
      } else {
        elemento.subaccountName = null;
      }
    }

    if (data.entryNumber) elemento.entryNumber = data.entryNumber;
    if (data.date) elemento.date = data.date;
    if (data.description) elemento.description = data.description;
    if (data.element !== undefined) elemento.element = data.element;
    if (data.elementDescription !== undefined) elemento.elementDescription = data.elementDescription;
    if (data.debit !== undefined) elemento.debit = data.debit;
    if (data.credit !== undefined) elemento.credit = data.credit;
    if (data.lineDescription !== undefined) elemento.lineDescription = data.lineDescription;
    if (data.costCenterId !== undefined) elemento.costCenterId = data.costCenterId;
    if (data.reference !== undefined) elemento.reference = data.reference;

    return this.elementoRepo.save(elemento);
  }

  async deleteElemento(companyId: number, id: string) {
    const elemento = await this.findOneElemento(companyId, id);

    // No permitir eliminar si ya está contabilizado
    if (elemento.status === 'posted') {
      throw new BadRequestException('No se puede eliminar un elemento contabilizado');
    }

    await this.elementoRepo.remove(elemento);
    return { message: 'Elemento eliminado correctamente' };
  }

  async updateElementoStatus(companyId: number, id: string, status: 'posted' | 'cancelled') {
    const elemento = await this.findOneElemento(companyId, id);
    elemento.status = status;
    return this.elementoRepo.save(elemento);
  }

  async getElementoStatistics(companyId: number) {
    const stats = await this.elementoRepo
      .createQueryBuilder('e')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN e.status = :posted THEN 1 ELSE 0 END)', 'posted')
      .addSelect('SUM(CASE WHEN e.status = :draft THEN 1 ELSE 0 END)', 'draft')
      .addSelect('SUM(CASE WHEN e.status = :cancelled THEN 1 ELSE 0 END)', 'cancelled')
      .addSelect('SUM(e.debit)', 'totalDebit')
      .addSelect('SUM(e.credit)', 'totalCredit')
      .where('e.companyId = :companyId', { companyId })
      .setParameter('posted', 'posted')
      .setParameter('draft', 'draft')
      .setParameter('cancelled', 'cancelled')
      .getRawOne();

    return {
      total: parseInt(stats.total) || 0,
      posted: parseInt(stats.posted) || 0,
      draft: parseInt(stats.draft) || 0,
      cancelled: parseInt(stats.cancelled) || 0,
      totalDebit: parseFloat(stats.totalDebit) || 0,
      totalCredit: parseFloat(stats.totalCredit) || 0,
    };
  }

  // ================================
  // EXPENSE TYPES (Tipos de Partidas)
  // ================================

  async findAllExpenseTypes(companyId: number) {
    return this.expenseTypeRepo.find({
      where: { companyId, isActive: true },
      order: { code: 'ASC' }
    });
  }

  async createExpenseType(companyId: number, data: { code: string; name: string; description?: string }) {
    const existing = await this.expenseTypeRepo.findOneBy({
      code: data.code,
      companyId
    });
    
    if (existing) {
      throw new BadRequestException(`Tipo de partida con código ${data.code} ya existe`);
    }

    const expenseType = new ExpenseType();
    expenseType.companyId = companyId;
    expenseType.code = data.code;
    expenseType.name = data.name;
    expenseType.description = data.description || null;

    return this.expenseTypeRepo.save(expenseType);
  }

  async seedExpenseTypes(companyId: number) {
    const defaultTypes = [
      { code: '11', name: 'Materia prima y Materiales', description: 'Materia prima y materiales utilizados en producción' },
      { code: '30', name: 'Combustibles y lubricantes', description: 'Combustibles y lubricantes para operaciones' },
      { code: '40', name: 'Energia', description: 'Consumo de energía eléctrica y otros' },
      { code: '50', name: 'Gastos de personal', description: 'Salarios y beneficios del personal' },
      { code: '70', name: 'Depreciacion y Amortizacion', description: 'Depreciación de activos fijos' },
      { code: '80', name: 'Otros gastos monetarios', description: 'Otros gastos monetarios diversos' },
      { code: '81', name: 'Gastos por importacion de servicios', description: 'Servicios importados' },
      { code: '82', name: 'Del presupuesto de de la seguridad social', description: 'Aportes y contribuciones a la seguridad social' },
      { code: '83', name: 'De la asistencia social', description: 'Gastos de asistencia social' },
      { code: '84', name: 'Transferencias , subsidios y subvenciones', description: 'Transferencias y subsidios otorgados' },
      { code: '90', name: 'Otras transferencias corrientes', description: 'Otras transferencias corrientes' }
    ];

    for (const typeData of defaultTypes) {
      const existing = await this.expenseTypeRepo.findOneBy({
        code: typeData.code,
        companyId
      });
      
      if (!existing) {
        await this.createExpenseType(companyId, typeData);
      }
    }

    return { message: 'Tipos de partida predefinidos creados exitosamente' };
  }
}
