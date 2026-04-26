/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { jsPDF } from 'jspdf';
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
        'openingBalance',
      )
      // Period debit
      .addSelect(
        `COALESCE(SUM(CASE 
          WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
          THEN vl.debit ELSE 0 END), 0)`,
        'periodDebit',
      )
      // Period credit
      .addSelect(
        `COALESCE(SUM(CASE 
          WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
          THEN vl.credit ELSE 0 END), 0)`,
        'periodCredit',
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
        'closingBalance',
      )
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere(
        `(:fromDate IS NULL OR v.date <= :toDate) AND (:toDate IS NULL OR v.date >= :fromDate)`,
      )
      .groupBy('vl.account_code')
      .addGroupBy('vl.account_name')
      .addGroupBy('a.nature')
      .addGroupBy('a.type')
      .having(
        `COALESCE(SUM(vl.debit), 0) > 0 OR COALESCE(SUM(vl.credit), 0) > 0`,
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

  async exportTrialBalanceExcel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
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
      .addSelect('a.nature', 'nature')
      .addSelect('vl.account_code', 'accountCode')
      .addSelect('vl.account_name', 'accountName')
      .addSelect(
        `CASE 
          WHEN a.nature = 'deudora' THEN SUM(vl.debit) - SUM(vl.credit)
          ELSE SUM(vl.credit) - SUM(vl.debit)
        END`,
        'balance',
      )
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (asOfDate) {
      qb.andWhere('v.date <= :asOfDate', { asOfDate });
    }

    qb.groupBy('a.type, a.nature, vl.account_code, vl.account_name')
      .orderBy('a.type')
      .addOrderBy('vl.account_code');

    const results = await qb.getRawMany();

    const assets = results.filter((r) => r.accountType === 'asset');
    const liabilities = results.filter((r) => r.accountType === 'liability');
    const equity = results.filter((r) => r.accountType === 'equity');

    const totalAssets = assets.reduce(
      (sum, a) => sum + Number(a.balance || 0),
      0,
    );
    const totalLiabilities = liabilities.reduce(
      (sum, l) => sum + Number(l.balance || 0),
      0,
    );
    const totalEquity = equity.reduce(
      (sum, e) => sum + Number(e.balance || 0),
      0,
    );

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

  async exportBalanceSheetExcel(
    companyId: number,
    asOfDate?: string,
    res?: Response,
  ) {
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
      worksheet.addRow([
        liability.accountCode,
        liability.accountName,
        liability.balance,
      ]);
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
    worksheet.addRow([
      'TOTAL PASIVO + PATRIMONIO',
      '',
      data.totals.liabilitiesAndEquity,
    ]);

    // Style
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6B8' },
    };
    worksheet.getRow(data.assets.length + 5).font = { bold: true };
    worksheet.getRow(data.assets.length + 7).font = { bold: true };
    worksheet.getRow(data.assets.length + 7).fill = {
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
      .andWhere('a.type IN (:...types)', { types: ['income', 'expense'] });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.groupBy('a.type, vl.account_code, vl.account_name')
      .orderBy('a.type')
      .addOrderBy('vl.account_code');

    const results = await qb.getRawMany();

    const income = results.filter((r) => r.accountType === 'income');
    const expenses = results.filter((r) => r.accountType === 'expense');

    const totalIncome = income.reduce(
      (sum, i) => sum + Number(i.totalCredit || 0),
      0,
    );
    const totalExpenses = expenses.reduce(
      (sum, e) => sum + Number(e.totalDebit || 0),
      0,
    );
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

  async exportIncomeStatementExcel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
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
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'C6E0B4' },
    };
    worksheet.getRow(data.income.length + 3).font = { bold: true };
    worksheet.getRow(data.income.length + 5).font = { bold: true };
    worksheet.getRow(data.income.length + 5).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FCE4D6' },
    };
    worksheet.getRow(data.income.length + data.expenses.length + 7).font = {
      bold: true,
    };
    worksheet.getRow(data.income.length + data.expenses.length + 7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'A9D08E' },
    };

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

  async getExpenseBreakdown(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
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

    qb.groupBy('vl.element, vl.element_name').orderBy('totalExpense', 'DESC');

    const results = await qb.getRawMany();

    const totalExpenses = results.reduce(
      (sum, r) => sum + Number(r.totalExpense || 0),
      0,
    );

    return {
      expenses: results.map((r) => ({
        element: r.element,
        elementName: r.elementName,
        amount: Number(r.totalExpense || 0),
        percentage:
          totalExpenses > 0
            ? (Number(r.totalExpense || 0) / totalExpenses) * 100
            : 0,
      })),
      totalExpenses,
    };
  }

  async exportExpenseBreakdownExcel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
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
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FCE4D6' },
    };
    worksheet.getRow(data.expenses.length + 2).font = { bold: true };
    worksheet.getRow(data.expenses.length + 2).fill = {
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
        'attachment; filename=expense-breakdown.xlsx',
      );

      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
    }

    return workbook;
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
    const lines = await qb.orderBy('v.date', 'ASC').getMany();
    const account = await this.accountRepo.findOneBy({
      code: accountCode,
      companyId,
    });
    let running = 0;
    const isDeudora = account?.nature === 'deudora';
    const entries = lines.map((l) => {
      const debit = Number(l.debit),
        credit = Number(l.credit);
      running += isDeudora ? debit - credit : credit - debit;
      return { ...l, runningBalance: running };
    });
    return {
      accountCode,
      accountName: account?.name || accountCode,
      nature: account?.nature,
      entries,
      finalBalance: running,
    };
  }

  async getGeneralJournal(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    return this.voucherRepo.find({
      where: {
        companyId,
        status: 'posted',
        ...(fromDate && { date: fromDate }),
      }, // ajustar rango
      relations: ['lines'],
      order: { date: 'ASC', voucherNumber: 'ASC' },
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
    return qb.groupBy('cc.code, cc.name').getRawMany();
  }

  // Export PDF methods
  async exportTrialBalancePDF(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const accounts = await this.getTrialBalance(companyId, fromDate, toDate);

    if (!accounts || accounts.length === 0) {
      throw new NotFoundException('No hay datos para generar el reporte');
    }

    // Calculate totals
    const totals = accounts.reduce(
      (acc, account) => ({
        openingBalance: acc.openingBalance + account.openingBalance,
        debit: acc.debit + account.periodDebit,
        credit: acc.credit + account.periodCredit,
        closingBalance: acc.closingBalance + account.closingBalance,
      }),
      { openingBalance: 0, debit: 0, credit: 0, closingBalance: 0 },
    );

    const doc = new jsPDF();

    // Setup fonts (using default jsPDF fonts)
    doc.setFontSize(20);
    doc.text('Balance de Comprobación', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text(
      `Período: ${fromDate || 'Inicio'} - ${toDate || 'Actual'}`,
      20,
      35,
    );

    // Table headers
    const headers = [
      'Código',
      'Cuenta',
      'Saldo Inicial',
      'Débito',
      'Crédito',
      'Saldo Final',
    ];
    const headerY = 55;
    const cellWidth = [25, 60, 25, 25, 25, 25];
    const startX = 20;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    headers.forEach((header, i) => {
      const x = startX + cellWidth.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(header, x, headerY);
    });

    // Table data
    doc.setFont('helvetica', 'normal');
    let y = headerY + 10;

    accounts.forEach((account: any) => {
      if (y > 270) {
        doc.addPage();
        y = 20;

        // Repeat headers on new page
        doc.setFont('helvetica', 'bold');
        headers.forEach((header, i) => {
          const x = startX + cellWidth.slice(0, i).reduce((a, b) => a + b, 0);
          doc.text(header, x, y);
        });
        y += 10;
        doc.setFont('helvetica', 'normal');
      }

      const data = [
        account.accountCode,
        account.accountName.substring(0, 25),
        this.formatCurrency(account.openingBalance),
        this.formatCurrency(account.periodDebit),
        this.formatCurrency(account.periodCredit),
        this.formatCurrency(account.closingBalance),
      ];

      data.forEach((value, i) => {
        const x = startX + cellWidth.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(value, x, y);
      });

      y += 8;
    });

    // Totals
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTALES', startX, y);
    doc.text(this.formatCurrency(totals.openingBalance), startX + 85, y);
    doc.text(this.formatCurrency(totals.debit), startX + 110, y);
    doc.text(this.formatCurrency(totals.credit), startX + 135, y);
    doc.text(this.formatCurrency(totals.closingBalance), startX + 160, y);

    // Footer
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const date = new Date().toLocaleString('es-ES');
    doc.text(`Generado: ${date}`, 20, 285);

    // Set response headers and send PDF
    if (res) {
      const filename = `balance-comprobacion-${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.send(Buffer.from(doc.output('arraybuffer')));
    }

    return {
      success: true,
      filename: `balance-comprobacion-${new Date().toISOString().split('T')[0]}.pdf`,
    };
  }

  async exportBalanceSheetPDF(
    companyId: number,
    asOfDate?: string,
    res?: Response,
  ) {
    const balanceSheet = await this.getBalanceSheet(companyId, asOfDate);

    const doc = new jsPDF();

    // Setup fonts
    doc.setFontSize(20);
    doc.text('Estado de Situación Financiera', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text(
      `Al: ${asOfDate || new Date().toISOString().split('T')[0]}`,
      20,
      35,
    );

    let y = 55;

    // Assets section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('ACTIVOS', 20, y);
    y += 10;

    doc.setFontSize(10);
    balanceSheet.assets.forEach((asset: any) => {
      doc.setFont('helvetica', 'normal');
      doc.text(asset.accountCode, 25, y);
      doc.text(asset.accountName.substring(0, 40), 50, y);
      doc.text(this.formatCurrency(asset.balance), 150, y, { align: 'right' });
      y += 8;
    });

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL ACTIVOS', 25, y);
    doc.text(this.formatCurrency(balanceSheet.totals.assets), 150, y, {
      align: 'right',
    });
    y += 15;

    // Liabilities section
    doc.setFontSize(14);
    doc.text('PASIVOS', 20, y);
    y += 10;

    doc.setFontSize(10);
    balanceSheet.liabilities.forEach((liability: any) => {
      doc.setFont('helvetica', 'normal');
      doc.text(liability.accountCode, 25, y);
      doc.text(liability.accountName.substring(0, 40), 50, y);
      doc.text(this.formatCurrency(liability.balance), 150, y, {
        align: 'right',
      });
      y += 8;
    });

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PASIVOS', 25, y);
    doc.text(this.formatCurrency(balanceSheet.totals.liabilities), 150, y, {
      align: 'right',
    });
    y += 15;

    // Equity section
    doc.setFontSize(14);
    doc.text('PATRIMONIO', 20, y);
    y += 10;

    doc.setFontSize(10);
    balanceSheet.equity.forEach((eq: any) => {
      doc.setFont('helvetica', 'normal');
      doc.text(eq.accountCode, 25, y);
      doc.text(eq.accountName.substring(0, 40), 50, y);
      doc.text(this.formatCurrency(eq.balance), 150, y, { align: 'right' });
      y += 8;
    });

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PATRIMONIO', 25, y);
    doc.text(this.formatCurrency(balanceSheet.totals.equity), 150, y, {
      align: 'right',
    });
    y += 15;

    // Total
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PASIVO + PATRIMONIO', 25, y);
    doc.text(
      this.formatCurrency(balanceSheet.totals.liabilitiesAndEquity),
      150,
      y,
      { align: 'right' },
    );

    // Footer
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const date = new Date().toLocaleString('es-ES');
    doc.text(`Generado: ${date}`, 20, 285);

    // Set response headers and send PDF
    if (res) {
      const filename = `estado-situacion-${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.send(Buffer.from(doc.output('arraybuffer')));
    }

    return {
      success: true,
      filename: `estado-situacion-${new Date().toISOString().split('T')[0]}.pdf`,
    };
  }

  async exportIncomeStatementPDF(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const incomeStatement = await this.getIncomeStatement(
      companyId,
      fromDate,
      toDate,
    );

    const doc = new jsPDF();

    // Setup fonts
    doc.setFontSize(20);
    doc.text('Estado de Rendimiento Financiero', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text(
      `Período: ${fromDate || 'Inicio'} - ${toDate || 'Actual'}`,
      20,
      35,
    );

    let y = 55;

    // Incomes section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INGRESOS', 20, y);
    y += 10;

    doc.setFontSize(10);
    incomeStatement.income.forEach((income: any) => {
      doc.setFont('helvetica', 'normal');
      doc.text(income.accountCode, 25, y);
      doc.text(income.accountName.substring(0, 40), 50, y);
      doc.text(this.formatCurrency(income.amount), 150, y, { align: 'right' });
      y += 8;
    });

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL INGRESOS', 25, y);
    doc.text(this.formatCurrency(incomeStatement.totals.totalIncome), 150, y, {
      align: 'right',
    });
    y += 15;

    // Expenses section
    doc.setFontSize(14);
    doc.text('GASTOS', 20, y);
    y += 10;

    doc.setFontSize(10);
    incomeStatement.expenses.forEach((expense: any) => {
      doc.setFont('helvetica', 'normal');
      doc.text(expense.accountCode, 25, y);
      doc.text(expense.accountName.substring(0, 40), 50, y);
      doc.text(this.formatCurrency(expense.amount), 150, y, { align: 'right' });
      y += 8;
    });

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL GASTOS', 25, y);
    doc.text(
      this.formatCurrency(incomeStatement.totals.totalExpenses),
      150,
      y,
      { align: 'right' },
    );
    y += 15;

    // Net Income
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('UTILIDAD NETA', 25, y);
    doc.text(this.formatCurrency(incomeStatement.totals.netIncome), 150, y, {
      align: 'right',
    });

    // Footer
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const date = new Date().toLocaleString('es-ES');
    doc.text(`Generado: ${date}`, 20, 285);

    // Set response headers and send PDF
    if (res) {
      const filename = `estado-rendimiento-${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.send(Buffer.from(doc.output('arraybuffer')));
    }

    return {
      success: true,
      filename: `estado-rendimiento-${new Date().toISOString().split('T')[0]}.pdf`,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── MODELO 5920 (Estado de Situación) ──
  // ══════════════════════════════════════════════════════════

  async exportModelo5920Excel(
    companyId: number,
    asOfDate?: string,
    res?: Response,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5920.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    // ACTIVO
    const efectivoCaja = await this.getAccountRangeBalance(
      companyId,
      ['101-108'],
      asOfDate,
    );
    const efectivoBanco = await this.getAccountRangeBalance(
      companyId,
      ['109-119'],
      asOfDate,
    );
    const cxcCorto = await this.getAccountRangeBalance(
      companyId,
      ['135-139', '154'],
      asOfDate,
    );
    const pagosAnticipadosSumin = await this.getAccountRangeBalance(
      companyId,
      ['146-149'],
      asOfDate,
    );
    const adeudosPresupuesto = await this.getAccountRangeBalance(
      companyId,
      ['164-166'],
      asOfDate,
    );
    const materiasPrimas = await this.getAccountRangeBalance(
      companyId,
      ['183'],
      asOfDate,
    );
    const utilesHerramientas = await this.getAccountRangeBalance(
      companyId,
      ['187'],
      asOfDate,
    );
    const alimentos = await this.getAccountRangeBalance(
      companyId,
      ['193'],
      asOfDate,
    );
    const aftTangibles = await this.getAccountRangeBalance(
      companyId,
      ['240-251'],
      asOfDate,
    );
    const depreciacionAft = await this.getAccountRangeBalanceCredit(
      companyId,
      ['375-388'],
      asOfDate,
    );
    const gastosDeficit = await this.getAccountRangeBalance(
      companyId,
      ['312'],
      asOfDate,
    );
    const cxcDiversas = await this.getAccountRangeBalance(
      companyId,
      ['334-341'],
      asOfDate,
    );
    // PASIVO
    const cxpCorto = await this.getAccountRangeBalanceCredit(
      companyId,
      ['405-415'],
      asOfDate,
    );
    const dividendosPagar = await this.getAccountRangeBalanceCredit(
      companyId,
      ['417'],
      asOfDate,
    );
    const obligPresupuesto = await this.getAccountRangeBalanceCredit(
      companyId,
      ['440-449'],
      asOfDate,
    );
    const nominasPagar = await this.getAccountRangeBalanceCredit(
      companyId,
      ['455-459'],
      asOfDate,
    );
    const gastosAcumulados = await this.getAccountRangeBalanceCredit(
      companyId,
      ['480-489'],
      asOfDate,
    );
    const provVacaciones = await this.getAccountRangeBalanceCredit(
      companyId,
      ['492'],
      asOfDate,
    );
    const provSubsidiosSS = await this.getAccountRangeBalanceCredit(
      companyId,
      ['500'],
      asOfDate,
    );
    const cxpDiversas = await this.getAccountRangeBalanceCredit(
      companyId,
      ['565-569'],
      asOfDate,
    );
    // PATRIMONIO
    const inversionEstatal = await this.getAccountRangeBalanceCredit(
      companyId,
      ['600-612'],
      asOfDate,
    );
    const reservasContingencias = await this.getAccountRangeBalanceCredit(
      companyId,
      ['645'],
      asOfDate,
    );
    const otrasReservas = await this.getAccountRangeBalanceCredit(
      companyId,
      ['646-654'],
      asOfDate,
    );
    const pagoCuentaUtilidades = await this.getAccountRangeBalance(
      companyId,
      ['690'],
      asOfDate,
    );
    const pagoCuentaDividendos = await this.getAccountRangeBalance(
      companyId,
      ['691'],
      asOfDate,
    );
    const resultadoPeriodo = await this.getAccountRangeBalanceCredit(
      companyId,
      ['800-899'],
      asOfDate,
    );

    // Fill data cells in column K — formulas preserved from template
    ws.getCell('K11').value = efectivoCaja;
    ws.getCell('K12').value = efectivoBanco;
    ws.getCell('K13').value = cxcCorto;
    ws.getCell('K14').value = pagosAnticipadosSumin;
    ws.getCell('K15').value = adeudosPresupuesto;
    ws.getCell('K17').value = materiasPrimas;
    ws.getCell('K18').value = utilesHerramientas;
    ws.getCell('K19').value = alimentos;
    ws.getCell('K21').value = aftTangibles;
    ws.getCell('K22').value = depreciacionAft;
    ws.getCell('K23').value = gastosDeficit;
    ws.getCell('K24').value = gastosDeficit;
    ws.getCell('K25').value = cxcDiversas;
    ws.getCell('K26').value = cxcDiversas;
    ws.getCell('K30').value = cxpCorto;
    ws.getCell('K31').value = dividendosPagar;
    ws.getCell('K32').value = obligPresupuesto;
    ws.getCell('K33').value = nominasPagar;
    ws.getCell('K34').value = gastosAcumulados;
    ws.getCell('K35').value = provVacaciones;
    ws.getCell('K36').value = provSubsidiosSS;
    ws.getCell('K39').value = cxpDiversas;
    ws.getCell('K42').value = inversionEstatal;
    ws.getCell('K43').value = reservasContingencias;
    ws.getCell('K44').value = otrasReservas;
    ws.getCell('K45').value = pagoCuentaUtilidades;
    ws.getCell('K46').value = pagoCuentaDividendos;
    ws.getCell('K47').value = resultadoPeriodo;

    const buffer = await wb.xlsx.writeBuffer();
    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Modelo_5920-04.xlsx',
      );
      res.send(Buffer.from(buffer as ArrayBuffer));
    }
    return Buffer.from(buffer as ArrayBuffer);
  }

  // ══════════════════════════════════════════════════════════
  // ── MODELO 5921 (Estado de Rendimiento Financiero) ──
  // ══════════════════════════════════════════════════════════

  async exportModelo5921Excel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5921.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    const ventas = await this.getAccountRangePeriodAmount(
      companyId,
      ['900-913'],
      fromDate,
      toDate,
    );
    const ventasVal = Math.abs(ventas.credit - ventas.debit);
    const impVentas = await this.getAccountRangePeriodAmount(
      companyId,
      ['805-809'],
      fromDate,
      toDate,
    );
    const impVentasVal = Math.abs(impVentas.debit - impVentas.credit);
    const costoVentas = await this.getAccountRangePeriodAmount(
      companyId,
      ['810-813'],
      fromDate,
      toDate,
    );
    const costoVentasVal = Math.abs(costoVentas.debit - costoVentas.credit);
    const gastosAdmin = await this.getAccountRangePeriodAmount(
      companyId,
      ['822-824'],
      fromDate,
      toDate,
    );
    const gastosAdminVal = Math.abs(gastosAdmin.debit - gastosAdmin.credit);
    const gastosOper = await this.getAccountRangePeriodAmount(
      companyId,
      ['826-833'],
      fromDate,
      toDate,
    );
    const gastosOperVal = Math.abs(gastosOper.debit - gastosOper.credit);
    const gastosFinancieros = await this.getAccountRangePeriodAmount(
      companyId,
      ['835-838'],
      fromDate,
      toDate,
    );
    const gastosFinancierosVal = Math.abs(
      gastosFinancieros.debit - gastosFinancieros.credit,
    );
    const gastosPerdidas = await this.getAccountRangePeriodAmount(
      companyId,
      ['845-848'],
      fromDate,
      toDate,
    );
    const gastosPerdidasVal = Math.abs(
      gastosPerdidas.debit - gastosPerdidas.credit,
    );
    const gastosPerdidasDesastres = await this.getAccountRangePeriodAmount(
      companyId,
      ['849'],
      fromDate,
      toDate,
    );
    const gastosPerdidasDesastresVal = Math.abs(
      gastosPerdidasDesastres.debit - gastosPerdidasDesastres.credit,
    );
    const otrosImpuestos = await this.getAccountRangePeriodAmount(
      companyId,
      ['855-864'],
      fromDate,
      toDate,
    );
    const otrosImpuestosVal = Math.abs(
      otrosImpuestos.debit - otrosImpuestos.credit,
    );
    const otrosGastos = await this.getAccountRangePeriodAmount(
      companyId,
      ['865-866'],
      fromDate,
      toDate,
    );
    const otrosGastosVal = Math.abs(otrosGastos.debit - otrosGastos.credit);
    const gastosRecupDesastres = await this.getAccountRangePeriodAmount(
      companyId,
      ['873'],
      fromDate,
      toDate,
    );
    const gastosRecupDesastresVal = Math.abs(
      gastosRecupDesastres.debit - gastosRecupDesastres.credit,
    );
    const ingresosFinancieros = await this.getAccountRangePeriodAmount(
      companyId,
      ['920-922'],
      fromDate,
      toDate,
    );
    const ingresosFinancierosVal = Math.abs(
      ingresosFinancieros.credit - ingresosFinancieros.debit,
    );
    const otrosIngresos = await this.getAccountRangePeriodAmount(
      companyId,
      ['950-952'],
      fromDate,
      toDate,
    );
    const otrosIngresosVal = Math.abs(
      otrosIngresos.credit - otrosIngresos.debit,
    );

    ws.getCell('K9').value = ventasVal;
    ws.getCell('K10').value = impVentasVal;
    ws.getCell('K12').value = costoVentasVal;
    ws.getCell('K15').value = gastosAdminVal;
    ws.getCell('K16').value = gastosOperVal;
    ws.getCell('K18').value = gastosFinancierosVal;
    ws.getCell('K19').value = gastosPerdidasVal;
    ws.getCell('K20').value = gastosPerdidasDesastresVal;
    ws.getCell('K21').value = otrosImpuestosVal;
    ws.getCell('K22').value = otrosGastosVal;
    ws.getCell('K23').value = gastosRecupDesastresVal;
    ws.getCell('K24').value = ingresosFinancierosVal;
    ws.getCell('K25').value = otrosIngresosVal;

    const buffer = await wb.xlsx.writeBuffer();
    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Modelo_5921-04.xlsx',
      );
      res.send(Buffer.from(buffer as ArrayBuffer));
    }
    return Buffer.from(buffer as ArrayBuffer);
  }

  // ══════════════════════════════════════════════════════════
  // ── MODELO 5924 (Desglose de Gastos por Elementos) ──
  // ══════════════════════════════════════════════════════════

  async exportModelo5924Excel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5924.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    // Obtener elementos con datos en el período
    const elementosQuery = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('vl.element', 'elementCode')
      .addSelect('vl.element_name', 'elementName')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.element IS NOT NULL')
      .groupBy('vl.element, vl.element_name');

    if (fromDate) elementosQuery.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) elementosQuery.andWhere('v.date <= :toDate', { toDate });

    const elementos = await elementosQuery.getRawMany();

    let currentRow = 10;
    for (const elemento of elementos) {
      const totalElemento = await this.getSubelementPeriodAmount(
        companyId,
        elemento.elementCode,
        undefined,
        fromDate,
        toDate,
      );
      const totalElementoVal = Math.abs(
        totalElemento.debit - totalElemento.credit,
      );

      ws.getCell(`A${currentRow}`).value = elemento.elementCode;
      ws.getCell(`B${currentRow}`).value = elemento.elementName;
      ws.getCell(`C${currentRow}`).value = totalElementoVal;
      currentRow++;

      // Obtener subelementos de este elemento
      const subelementosQuery = this.voucherLineRepo
        .createQueryBuilder('vl')
        .select('vl.subelement', 'subelementCode')
        .addSelect('vl.subelement_name', 'subelementName')
        .innerJoin('vl.voucher', 'v')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.status = :status', { status: 'posted' })
        .andWhere('vl.element = :elementCode', {
          elementCode: elemento.elementCode,
        })
        .andWhere('vl.subelement IS NOT NULL')
        .groupBy('vl.subelement, vl.subelement_name');

      if (fromDate)
        subelementosQuery.andWhere('v.date >= :fromDate', { fromDate });
      if (toDate) subelementosQuery.andWhere('v.date <= :toDate', { toDate });

      const subelementos = await subelementosQuery.getRawMany();
      for (const subelemento of subelementos) {
        const totalSubelemento = await this.getSubelementPeriodAmount(
          companyId,
          elemento.elementCode,
          subelemento.subelementCode,
          fromDate,
          toDate,
        );
        const totalSubelementoVal = Math.abs(
          totalSubelemento.debit - totalSubelemento.credit,
        );
        ws.getCell(`B${currentRow}`).value = subelemento.subelementCode;
        ws.getCell(`C${currentRow}`).value = subelemento.subelementName;
        ws.getCell(`D${currentRow}`).value = totalSubelementoVal;
        currentRow++;
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Modelo_5924.xlsx',
      );
      res.send(Buffer.from(buffer as ArrayBuffer));
    }
    return Buffer.from(buffer as ArrayBuffer);
  }

  // ══════════════════════════════════════════════════════════
  // ── ADDITIONAL METHODS ──
  // ══════════════════════════════════════════════════════════

  async findAllEntries(companyId: number, filters?: any) {
    return this.voucherRepo.find({
      where: { companyId },
      relations: ['lines'],
      order: { date: 'DESC' },
    });
  }

  async getFinancialKPIs(companyId: number) {
    const balanceSheet = await this.getBalanceSheet(companyId);
    const totalAssets = balanceSheet.totals.assets;
    const totalLiabilities = balanceSheet.totals.liabilities;
    const totalEquity = balanceSheet.totals.equity;

    // Ratios financieros básicos
    const currentRatio =
      totalLiabilities > 0 ? totalAssets / totalLiabilities : 0;
    const debtToEquity = totalEquity > 0 ? totalLiabilities / totalEquity : 0;

    // Totales de vouchers
    const vouchers = await this.voucherRepo.find({
      where: { companyId, status: 'posted' as any },
    });
    const totalPostedAmount = vouchers.reduce(
      (sum, v) => sum + Number(v.totalAmount || 0),
      0,
    );

    // KPIs de ingresos y gastos del mes actual
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Helper para sumar por tipo de cuenta y período
    const getAccountTypeBalance = async (
      accountTypes: string[],
      startDate: Date,
      endDate: Date,
    ) => {
      const qb = this.voucherLineRepo
        .createQueryBuilder('vl')
        .select('SUM(vl.debit) - SUM(vl.credit)', 'balance')
        .innerJoin('vl.voucher', 'v')
        .innerJoin('vl.account', 'a')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.status = :status', { status: 'posted' })
        .andWhere('v.date >= :startDate', { startDate })
        .andWhere('v.date <= :endDate', { endDate })
        .andWhere('a.type IN (:...accountTypes)', { accountTypes });

      const result = await qb.getRawOne();
      return Number(result?.balance || 0);
    };

    // Ingresos y gastos del mes actual (naturaleza acreedora/deudora)
    const currentMonthRevenue = Math.abs(
      await getAccountTypeBalance(['income'], currentMonthStart, now),
    );
    const currentMonthExpenses = Math.abs(
      await getAccountTypeBalance(['expense'], currentMonthStart, now),
    );

    // Ingresos y gastos del mes anterior para tendencias
    const lastMonthRevenue = Math.abs(
      await getAccountTypeBalance(['income'], lastMonthStart, lastMonthEnd),
    );
    const lastMonthExpenses = Math.abs(
      await getAccountTypeBalance(['expense'], lastMonthStart, lastMonthEnd),
    );

    // Calcular tendencias (% cambio)
    const revenueTrend =
      lastMonthRevenue > 0
        ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;
    const expenseTrend =
      lastMonthExpenses > 0
        ? ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100
        : 0;

    // Utilidad neta del mes actual
    const netIncome = currentMonthRevenue - currentMonthExpenses;

    return {
      totalAssets,
      totalLiabilities,
      totalEquity,
      netIncome,
      currentMonthRevenue,
      currentMonthExpenses,
      revenueTrend: Number(revenueTrend.toFixed(1)),
      expenseTrend: Number(expenseTrend.toFixed(1)),
      currentRatio: Number(currentRatio.toFixed(2)),
      debtToEquityRatio: Number(debtToEquity.toFixed(2)),
      totalPostedVouchers: vouchers.length,
      totalPostedAmount,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── PRIVATE HELPERS ──
  // ═════════════════════════════════════════════════════════

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private async getAccountRangeBalance(
    companyId: number,
    codeRanges: string[],
    asOfDate?: string,
  ): Promise<number> {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('SUM(vl.debit) - SUM(vl.credit)', 'balance')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (asOfDate) qb.andWhere('v.date <= :asOfDate', { asOfDate });

    const conditions: string[] = [];
    const params: Record<string, any> = {};
    codeRanges.forEach((range, i) => {
      if (range.includes('-')) {
        const [from, to] = range.split('-').map((s) => s.trim());
        conditions.push(
          `(LPAD(vl.account_code, 10, '0') >= LPAD(:from${i}, 10, '0') AND LPAD(vl.account_code, 10, '0') <= LPAD(:to${i}, 10, '0'))`,
        );
        params[`from${i}`] = from;
        params[`to${i}`] = to;
      } else {
        conditions.push(`vl.account_code = :code${i}`);
        params[`code${i}`] = range.trim();
      }
    });

    if (conditions.length > 0) {
      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }

    const result = await qb.getRawOne();
    return Number(result?.balance || 0);
  }

  private async getAccountRangeBalanceCredit(
    companyId: number,
    codeRanges: string[],
    asOfDate?: string,
  ): Promise<number> {
    const balance = await this.getAccountRangeBalance(
      companyId,
      codeRanges,
      asOfDate,
    );
    return Math.abs(balance);
  }

  private async getAccountRangePeriodAmount(
    companyId: number,
    codeRanges: string[],
    fromDate?: string,
    toDate?: string,
  ): Promise<{ debit: number; credit: number }> {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    const conditions: string[] = [];
    const params: Record<string, any> = {};
    codeRanges.forEach((range, i) => {
      if (range.includes('-')) {
        const [from, to] = range.split('-').map((s) => s.trim());
        conditions.push(
          `(LPAD(vl.account_code, 10, '0') >= LPAD(:from${i}, 10, '0') AND LPAD(vl.account_code, 10, '0') <= LPAD(:to${i}, 10, '0'))`,
        );
        params[`from${i}`] = from;
        params[`to${i}`] = to;
      } else {
        conditions.push(`vl.account_code = :code${i}`);
        params[`code${i}`] = range.trim();
      }
    });

    if (conditions.length > 0) {
      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }

    const result = await qb.getRawOne();
    return {
      debit: Number(result?.totalDebit || 0),
      credit: Number(result?.totalCredit || 0),
    };
  }

  private async getSubelementPeriodAmount(
    companyId: number,
    elementCode?: string,
    subelementCode?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<{ debit: number; credit: number }> {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });
    if (elementCode) qb.andWhere('vl.element = :elementCode', { elementCode });
    if (subelementCode)
      qb.andWhere('vl.subelement = :subelementCode', { subelementCode });

    const result = await qb.getRawOne();
    return {
      debit: Number(result?.totalDebit || 0),
      credit: Number(result?.totalCredit || 0),
    };
  }
}
