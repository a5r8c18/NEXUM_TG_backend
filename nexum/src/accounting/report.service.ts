import { Injectable, NotFoundException, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { VoucherLine } from '../entities/voucher-line.entity';
import { Voucher } from '../entities/voucher.entity';
import { Account } from '../entities/account.entity';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(VoucherLine)
    private readonly voucherLineRepo: Repository<VoucherLine>,
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── TRIAL BALANCE ──
  // ══════════════════════════════════════════════════════════

  async getTrialBalance(companyId: number, fromDate?: string, toDate?: string) {
    // Optimized single query to eliminate N+1 problem
    const trialBalanceQuery = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('vl.account_code', 'accountCode')
      .addSelect('vl.account_name', 'accountName')
      .addSelect('a.nature', 'nature')
      .addSelect('a.type', 'accountType')
      // Opening balance calculation
      .addSelect(
        `CASE 
          WHEN a.nature = 'deudora'
          THEN COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0) - 
               COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0)
          ELSE COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0) - 
               COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0)
        END`,
        'openingBalance'
      )
      // Period debit
      .addSelect(
        `COALESCE(SUM(CASE 
          WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
          THEN vl.debit ELSE 0 END), 0)`,
        'periodDebit'
      )
      // Period credit
      .addSelect(
        `COALESCE(SUM(CASE 
          WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
          THEN vl.credit ELSE 0 END), 0)`,
        'periodCredit'
      )
      // Closing balance calculation
      .addSelect(
        `CASE 
          WHEN a.nature = 'deudora'
          THEN (COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0)) +
               (COALESCE(SUM(CASE 
                 WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
                 THEN vl.debit ELSE 0 END), 0) - 
                COALESCE(SUM(CASE 
                 WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
                 THEN vl.credit ELSE 0 END), 0))
          ELSE (COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0)) +
               (COALESCE(SUM(CASE 
                 WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
                 THEN vl.credit ELSE 0 END), 0) - 
                COALESCE(SUM(CASE 
                 WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
                 THEN vl.debit ELSE 0 END), 0))
        END`,
        'closingBalance'
      )
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere(
        `(:fromDate IS NULL OR v.date <= :toDate) AND (:toDate IS NULL OR v.date >= :fromDate)`
      )
      .groupBy('vl.account_code')
      .addGroupBy('vl.account_name')
      .addGroupBy('a.nature')
      .addGroupBy('a.type')
      .having(
        `COALESCE(SUM(vl.debit), 0) > 0 OR COALESCE(SUM(vl.credit), 0) > 0`
      )
      .orderBy('vl.account_code', 'ASC');

    trialBalanceQuery.setParameters({
      companyId,
      fromDate: fromDate || null,
      toDate: toDate || null,
    });

    const results = await trialBalanceQuery.getRawMany();

    return results.map((row: any) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      nature: row.nature || 'deudora',
      accountType: row.accountType || '',
      openingBalance: Number(row.openingBalance || 0),
      periodDebit: Number(row.periodDebit || 0),
      periodCredit: Number(row.periodCredit || 0),
      closingBalance: Number(row.closingBalance || 0),
    }));
  }

  async exportTrialBalanceExcel(companyId: number, fromDate?: string, toDate?: string, res?: Response) {
    const data = await this.getTrialBalance(companyId, fromDate, toDate);

    if (!data || data.length === 0) {
      throw new NotFoundException('No hay datos para generar el reporte');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Balance de Comprobación');

    // Headers
    worksheet.columns = [
      { header: 'Código', key: 'accountCode', width: 15 },
      { header: 'Nombre Cuenta', key: 'accountName', width: 30 },
      { header: 'Naturaleza', key: 'nature', width: 12 },
      { header: 'Saldo Inicial', key: 'openingBalance', width: 15 },
      { header: 'Débito Período', key: 'periodDebit', width: 15 },
      { header: 'Crédito Período', key: 'periodCredit', width: 15 },
      { header: 'Saldo Final', key: 'closingBalance', width: 15 },
    ];

    // Data
    data.forEach((row) => {
      worksheet.addRow({
        accountCode: row.accountCode,
        accountName: row.accountName,
        nature: row.nature,
        openingBalance: row.openingBalance,
        periodDebit: row.periodDebit,
        periodCredit: row.periodCredit,
        closingBalance: row.closingBalance,
      });
    });

    // Totals
    const totalRow = worksheet.addRow({
      accountCode: 'TOTALES',
      openingBalance: data.reduce((sum, row) => sum + row.openingBalance, 0),
      periodDebit: data.reduce((sum, row) => sum + row.periodDebit, 0),
      periodCredit: data.reduce((sum, row) => sum + row.periodCredit, 0),
      closingBalance: data.reduce((sum, row) => sum + row.closingBalance, 0),
    });

    // Style
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6B8' },
    };
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'D9E1F2' },
    };

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=trial-balance.xlsx',
      );

      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
    }

    return workbook;
  }

  // ══════════════════════════════════════════════════════════
  // ── BALANCE SHEET ──
  // ══════════════════════════════════════════════════════════

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
      .andWhere('v.status = :status', { status: 'posted' });

    if (asOfDate) {
      qb.andWhere('v.date <= :asOfDate', { asOfDate });
    }

    qb.groupBy('a.type, vl.account_code, vl.account_name')
      .orderBy('a.type')
      .addOrderBy('vl.account_code');

    const results = await qb.getRawMany();

    const assets = results.filter((r) => r.accountType === 'asset');
    const liabilities = results.filter((r) => r.accountType === 'liability');
    const equity = results.filter((r) => r.accountType === 'equity');

    const totalAssets = assets.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + Number(l.balance || 0), 0);
    const totalEquity = equity.reduce((sum, e) => sum + Number(e.balance || 0), 0);

    return {
      assets: assets.map((a) => ({
        accountCode: a.accountCode,
        accountName: a.accountName,
        balance: Number(a.balance || 0),
      })),
      liabilities: liabilities.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        balance: Number(l.balance || 0),
      })),
      equity: equity.map((e) => ({
        accountCode: e.accountCode,
        accountName: e.accountName,
        balance: Number(e.balance || 0),
      })),
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        liabilitiesAndEquity: totalLiabilities + totalEquity,
      },
    };
  }

  async exportBalanceSheetExcel(companyId: number, asOfDate?: string, res?: Response) {
    const data = await this.getBalanceSheet(companyId, asOfDate);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Balance General');

    // Assets section
    worksheet.addRow('ACTIVOS');
    worksheet.addRow(['Código', 'Cuenta', 'Balance']);
    data.assets.forEach((asset) => {
      worksheet.addRow([asset.accountCode, asset.accountName, asset.balance]);
    });
    worksheet.addRow(['TOTAL ACTIVOS', '', data.totals.assets]);

    worksheet.addRow(''); // Empty row

    // Liabilities section
    worksheet.addRow('PASIVOS');
    worksheet.addRow(['Código', 'Cuenta', 'Balance']);
    data.liabilities.forEach((liability) => {
      worksheet.addRow([liability.accountCode, liability.accountName, liability.balance]);
    });
    worksheet.addRow(['TOTAL PASIVOS', '', data.totals.liabilities]);

    worksheet.addRow(''); // Empty row

    // Equity section
    worksheet.addRow('PATRIMONIO');
    worksheet.addRow(['Código', 'Cuenta', 'Balance']);
    data.equity.forEach((eq) => {
      worksheet.addRow([eq.accountCode, eq.accountName, eq.balance]);
    });
    worksheet.addRow(['TOTAL PATRIMONIO', '', data.totals.equity]);

    worksheet.addRow(''); // Empty row
    worksheet.addRow(['TOTAL PASIVO + PATRIMONIO', '', data.totals.liabilitiesAndEquity]);

    // Style
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6B8' } };
    worksheet.getRow(data.assets.length + 5).font = { bold: true };
    worksheet.getRow(data.assets.length + 7).font = { bold: true };
    worksheet.getRow(data.assets.length + 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' } };

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=balance-sheet.xlsx',
      );

      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
    }

    return workbook;
  }

  // ══════════════════════════════════════════════════════════
  // ── INCOME STATEMENT ──
  // ══════════════════════════════════════════════════════════

  async getIncomeStatement(companyId: number, fromDate?: string, toDate?: string) {
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
      .andWhere('a.type IN (:...types)', { types: ['income', 'expense'] });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.groupBy('a.type, vl.account_code, vl.account_name')
      .orderBy('a.type')
      .addOrderBy('vl.account_code');

    const results = await qb.getRawMany();

    const income = results.filter((r) => r.accountType === 'income');
    const expenses = results.filter((r) => r.accountType === 'expense');

    const totalIncome = income.reduce((sum, i) => sum + Number(i.totalCredit || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.totalDebit || 0), 0);
    const netIncome = totalIncome - totalExpenses;

    return {
      income: income.map((i) => ({
        accountCode: i.accountCode,
        accountName: i.accountName,
        amount: Number(i.totalCredit || 0),
      })),
      expenses: expenses.map((e) => ({
        accountCode: e.accountCode,
        accountName: e.accountName,
        amount: Number(e.totalDebit || 0),
      })),
      totals: {
        totalIncome,
        totalExpenses,
        netIncome,
      },
    };
  }

  async exportIncomeStatementExcel(companyId: number, fromDate?: string, toDate?: string, res?: Response) {
    const data = await this.getIncomeStatement(companyId, fromDate, toDate);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Estado de Resultados');

    // Income section
    worksheet.addRow('INGRESOS');
    worksheet.addRow(['Código', 'Cuenta', 'Monto']);
    data.income.forEach((inc) => {
      worksheet.addRow([inc.accountCode, inc.accountName, inc.amount]);
    });
    worksheet.addRow(['TOTAL INGRESOS', '', data.totals.totalIncome]);

    worksheet.addRow(''); // Empty row

    // Expenses section
    worksheet.addRow('EGRESOS');
    worksheet.addRow(['Código', 'Cuenta', 'Monto']);
    data.expenses.forEach((exp) => {
      worksheet.addRow([exp.accountCode, exp.accountName, exp.amount]);
    });
    worksheet.addRow(['TOTAL EGRESOS', '', data.totals.totalExpenses]);

    worksheet.addRow(''); // Empty row
    worksheet.addRow(['UTILIDAD NETA', '', data.totals.netIncome]);

    // Style
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6E0B4' } };
    worksheet.getRow(data.income.length + 3).font = { bold: true };
    worksheet.getRow(data.income.length + 5).font = { bold: true };
    worksheet.getRow(data.income.length + 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FCE4D6' } };
    worksheet.getRow(data.income.length + data.expenses.length + 7).font = { bold: true };
    worksheet.getRow(data.income.length + data.expenses.length + 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'A9D08E' } };

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=income-statement.xlsx',
      );

      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
    }

    return workbook;
  }

  // ══════════════════════════════════════════════════════════
  // ── EXPENSE BREAKDOWN ──
  // ══════════════════════════════════════════════════════════

  async getExpenseBreakdown(companyId: number, fromDate?: string, toDate?: string) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('vl.element', 'element')
      .addSelect('vl.element_name', 'elementName')
      .addSelect('SUM(vl.debit)', 'totalExpense')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('a.type = :type', { type: 'expense' })
      .andWhere('vl.element IS NOT NULL');

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.groupBy('vl.element, vl.element_name')
      .orderBy('totalExpense', 'DESC');

    const results = await qb.getRawMany();

    const totalExpenses = results.reduce((sum, r) => sum + Number(r.totalExpense || 0), 0);

    return {
      expenses: results.map((r) => ({
        element: r.element,
        elementName: r.elementName,
        amount: Number(r.totalExpense || 0),
        percentage: totalExpenses > 0 ? (Number(r.totalExpense || 0) / totalExpenses) * 100 : 0,
      })),
      totalExpenses,
    };
  }

  async exportExpenseBreakdownExcel(companyId: number, fromDate?: string, toDate?: string, res?: Response) {
    const data = await this.getExpenseBreakdown(companyId, fromDate, toDate);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Desglose de Gastos');

    worksheet.columns = [
      { header: 'Elemento', key: 'element', width: 15 },
      { header: 'Nombre Elemento', key: 'elementName', width: 30 },
      { header: 'Monto', key: 'amount', width: 15 },
      { header: 'Porcentaje', key: 'percentage', width: 12 },
    ];

    data.expenses.forEach((exp) => {
      worksheet.addRow({
        element: exp.element,
        elementName: exp.elementName,
        amount: exp.amount,
        percentage: exp.percentage.toFixed(2) + '%',
      });
    });

    worksheet.addRow(['TOTAL', '', data.totalExpenses, '100.00%']);

    // Style
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FCE4D6' } };
    worksheet.getRow(data.expenses.length + 2).font = { bold: true };
    worksheet.getRow(data.expenses.length + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' } };

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=expense-breakdown.xlsx',
      );

      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
    }

    return workbook;
  }

  async getGeneralLedger(companyId: number, accountCode: string, fromDate?: string, toDate?: string) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoinAndSelect('vl.voucher', 'v')
      .leftJoinAndSelect('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.account_code = :accountCode', { accountCode });
    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });
    const lines = await qb.orderBy('v.date', 'ASC').getMany();
    const account = await this.accountRepo.findOneBy({ code: accountCode, companyId });
    let running = 0;
    const isDeudora = account?.nature === 'deudora';
    const entries = lines.map(l => {
      const debit = Number(l.debit), credit = Number(l.credit);
      running += isDeudora ? debit - credit : credit - debit;
      return { ...l, runningBalance: running };
    });
    return { accountCode, accountName: account?.name || accountCode, nature: account?.nature, entries, finalBalance: running };
  }

  async getGeneralJournal(companyId: number, fromDate?: string, toDate?: string) {
    return this.voucherRepo.find({
      where: { companyId, status: 'posted', ...(fromDate && { date: fromDate }) }, // ajustar rango
      relations: ['lines'],
      order: { date: 'ASC', voucherNumber: 'ASC' },
    });
  }

  async getCostCenterAnalysis(companyId: number, fromDate?: string, toDate?: string) {
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
    return qb.groupBy('cc.code, cc.name').getRawMany();
  }

  // Export PDF methods (placeholder implementations)
  async exportTrialBalancePDF(companyId: number, fromDate?: string, toDate?: string, res?: Response) {
    return { message: 'PDF export not implemented yet', companyId, fromDate, toDate };
  }

  async exportBalanceSheetPDF(companyId: number, asOfDate?: string, res?: Response) {
    return { message: 'PDF export not implemented yet', companyId, asOfDate };
  }

  async exportIncomeStatementPDF(companyId: number, fromDate?: string, toDate?: string, res?: Response) {
    return { message: 'PDF export not implemented yet', companyId, fromDate, toDate };
  }

  // Modelo 592 methods (placeholder implementations)
  async exportModelo5920Excel(companyId: number, asOfDate?: string, res?: Response) {
    return { message: 'Modelo 5920 export not implemented yet', companyId, asOfDate };
  }

  async exportModelo5921Excel(companyId: number, fromDate?: string, toDate?: string, res?: Response) {
    return { message: 'Modelo 5921 export not implemented yet', companyId, fromDate, toDate };
  }

  async exportModelo5924Excel(companyId: number, fromDate?: string, toDate?: string, res?: Response) {
    return { message: 'Modelo 5924 export not implemented yet', companyId, fromDate, toDate };
  }

  // Additional methods
  async findAllEntries(companyId: number, filters?: any) {
    return this.voucherRepo.find({
      where: { companyId },
      relations: ['lines'],
      order: { date: 'DESC' },
    });
  }

  async getFinancialKPIs(companyId: number) {
    return { message: 'Financial KPIs not implemented yet', companyId };
  }
}
