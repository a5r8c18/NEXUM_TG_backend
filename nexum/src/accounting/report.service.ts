/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Injectable, NotFoundException, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { jsPDF } from 'jspdf';
import { VoucherLine } from '../entities/voucher-line.entity';
import { Voucher } from '../entities/voucher.entity';
import { Account } from '../entities/account.entity';
import { GeneratedReport } from '../entities/generated-report.entity';
import { FiscalYear } from '../entities/fiscal-year.entity';
import { Company } from '../entities/company.entity';
import { CacheService } from '../cache/cache.service';
import { Efe5920Data, Efe5921Data, Efe5922Data, Efe5923Data, Efe5924Data, FlujoEfectivoData } from './pdf.service';

/** Orientación del papel en los informes exportados a PDF. */
export type ReportOrientation = 'portrait' | 'landscape';

/** Opciones comunes a todos los informes contables. */
export interface ReportOptions {
  /** Incluye comprobantes en borrador (sin contabilizar). */
  includeDrafts?: boolean;
  /** Excluye los asientos de cierre del ejercicio. */
  beforeClosing?: boolean;
  /**
   * Agrupa los saldos a nivel de cuenta, sin desglosar las subcuentas.
   * Cuando es `false` (por defecto) se muestra cuenta-subcuenta.
   */
  accountsOnly?: boolean;
  /** Orientación del PDF generado. Por defecto vertical. */
  orientation?: ReportOrientation;
}

@Injectable()
export class ReportService {
  private static readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectRepository(VoucherLine)
    private readonly voucherLineRepo: Repository<VoucherLine>,
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(GeneratedReport)
    private readonly generatedReportRepo: Repository<GeneratedReport>,
    @InjectRepository(FiscalYear)
    private readonly fiscalYearRepo: Repository<FiscalYear>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly cacheService: CacheService,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── OPCIONES COMUNES DE LOS INFORMES ──
  // ══════════════════════════════════════════════════════════

  /**
   * Estados de comprobante que integran un informe. Los anulados nunca se
   * incluyen; los borradores solo cuando se piden explícitamente.
   */
  private voucherStatuses(includeDrafts?: boolean): string[] {
    return includeDrafts ? ['posted', 'draft'] : ['posted'];
  }

  /**
   * Sufijo de clave de caché para no mezclar resultados de distintas opciones.
   * La orientación no se incluye porque no altera los datos, solo el PDF.
   */
  private optionsCacheKey(opts?: ReportOptions): string {
    return `${opts?.includeDrafts ? 'drafts' : 'posted'}:${opts?.beforeClosing ? 'preclose' : 'full'}:${opts?.accountsOnly ? 'accounts' : 'subaccounts'}`;
  }

  /** Orientación efectiva del PDF (vertical por defecto). */
  private pdfOrientation(opts?: ReportOptions): ReportOrientation {
    return opts?.orientation === 'landscape' ? 'landscape' : 'portrait';
  }

  /**
   * Aplica los filtros comunes (estado y exclusión de asientos de cierre) a
   * una consulta que ya tenga el alias `v` sobre `vouchers`.
   */
  private applyVoucherFilters(
    qb: SelectQueryBuilder<any>,
    opts?: ReportOptions,
  ) {
    qb.andWhere('v.status IN (:...statuses)', {
      statuses: this.voucherStatuses(opts?.includeDrafts),
    });
    if (opts?.beforeClosing) {
      qb.andWhere('v.type != :closingType', { closingType: 'cierre' });
    }
    return qb;
  }

  // ══════════════════════════════════════════════════════════
  // ── UTILIDADES DE PDF ──
  // ══════════════════════════════════════════════════════════

  /** Nota aclaratoria para el encabezado cuando hay opciones activas. */
  private optionsNote(opts?: ReportOptions): string {
    const notes: string[] = [];
    if (opts?.includeDrafts) notes.push('Incluye comprobantes sin contabilizar');
    if (opts?.beforeClosing) notes.push('Antes de cierre');
    if (opts?.accountsOnly) notes.push('Solo cuentas');
    return notes.length ? `  ·  ${notes.join('  ·  ')}` : '';
  }

  /** Escribe el PDF en la respuesta o lo devuelve como buffer. */
  private sendPdf(doc: jsPDF, filename: string, res?: Response) {
    const buffer = Buffer.from(doc.output('arraybuffer'));
    if (res) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
      return;
    }
    return { success: true, filename, buffer };
  }

  /**
   * Construye un PDF tabular por secciones con salto de página automático y
   * repetición de encabezado. Lo usan los informes de estructura
   * "secciones + totales" (situación, rendimiento, gastos).
   */
  private buildSectionPdf(opts: {
    title: string;
    subtitle: string;
    companyName?: string;
    headers: string[];
    widths: number[];
    aligns: ('left' | 'right')[];
    sections: {
      title: string;
      rows: string[][];
      totalLabel?: string;
      totalValues?: string[];
    }[];
    grandTotalLabel?: string;
    grandTotalValues?: string[];
    orientation?: ReportOrientation;
  }): jsPDF {
    const orientation = opts.orientation ?? 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const startX = 14;
    const rowHeight = 6;
    const bottomLimit = pageHeight - 16;

    // Los anchos base están pensados para A4 vertical; se reescalan al ancho
    // útil real para que la tabla ocupe la página en cualquier orientación.
    const baseWidth = opts.widths.reduce((a, b) => a + b, 0);
    const scale = (pageWidth - startX * 2) / baseWidth;
    const widths = opts.widths.map((w) => w * scale);

    const colX: number[] = [];
    widths.reduce((x, w) => {
      colX.push(x);
      return x + w;
    }, startX);
    const tableWidth = widths.reduce((a, b) => a + b, 0);

    const cellX = (i: number) =>
      opts.aligns[i] === 'right' ? colX[i] + widths[i] - 2 : colX[i] + 2;

    const writeRow = (cells: string[], y: number, bold: boolean) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      cells.forEach((cell, i) => {
        if (i >= widths.length) return;
        const text = doc.splitTextToSize(cell ?? '', widths[i] - 4)[0] ?? '';
        doc.text(text, cellX(i), y + 4.2, { align: opts.aligns[i] });
      });
    };

    const drawPageHeader = (): number => {
      let y = 16;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(opts.title.toUpperCase(), pageWidth / 2, y, { align: 'center' });

      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      if (opts.companyName) {
        doc.text(opts.companyName, pageWidth / 2, y, { align: 'center' });
        y += 5;
      }
      doc.text(opts.subtitle, pageWidth / 2, y, { align: 'center' });

      y += 4;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(230, 230, 230);
      doc.rect(startX, y, tableWidth, rowHeight, 'FD');
      writeRow(opts.headers, y, true);
      doc.setFont('helvetica', 'normal');
      return y + rowHeight;
    };

    let y = drawPageHeader();
    const ensureSpace = (needed: number) => {
      if (y + needed > bottomLimit) {
        doc.addPage();
        y = drawPageHeader();
      }
    };

    doc.setFontSize(8);
    opts.sections.forEach((section) => {
      ensureSpace(rowHeight * 2);
      doc.setFillColor(245, 245, 245);
      doc.rect(startX, y, tableWidth, rowHeight, 'FD');
      writeRow([section.title], y, true);
      y += rowHeight;

      if (section.rows.length === 0) {
        doc.rect(startX, y, tableWidth, rowHeight);
        writeRow(['Sin movimientos en el período'], y, false);
        y += rowHeight;
      }

      section.rows.forEach((row) => {
        ensureSpace(rowHeight);
        widths.forEach((w, i) => doc.rect(colX[i], y, w, rowHeight));
        writeRow(row, y, false);
        y += rowHeight;
      });

      if (section.totalLabel) {
        ensureSpace(rowHeight);
        widths.forEach((w, i) => doc.rect(colX[i], y, w, rowHeight));
        writeRow(
          [section.totalLabel, ...(section.totalValues ?? [])],
          y,
          true,
        );
        y += rowHeight;
      }
      y += 2;
    });

    if (opts.grandTotalLabel) {
      ensureSpace(rowHeight);
      doc.setFillColor(220, 228, 240);
      doc.rect(startX, y, tableWidth, rowHeight, 'FD');
      writeRow(
        [opts.grandTotalLabel, ...(opts.grandTotalValues ?? [])],
        y,
        true,
      );
      y += rowHeight;
    }

    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(
        `Generado: ${new Date().toLocaleString('es-ES')}`,
        startX,
        pageHeight - 8,
      );
      doc.text(`Página ${p} de ${pages}`, startX + tableWidth, pageHeight - 8, {
        align: 'right',
      });
    }

    return doc;
  }

  // ══════════════════════════════════════════════════════════
  // ── TRIAL BALANCE ──
  // ══════════════════════════════════════════════════════════

  async getTrialBalance(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ) {
    const cacheKey = `reports:${companyId}:trial-balance:${fromDate || 'all'}:${toDate || 'all'}:${this.optionsCacheKey(options)}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this._getTrialBalance(companyId, fromDate, toDate, options),
      ReportService.CACHE_TTL,
    );
  }

  private async _getTrialBalance(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ) {
    // Rango efectivo. Si no se indica, se abarca todo el histórico para que
    // ninguna cuenta con movimientos quede fuera del balance.
    const periodFrom = fromDate || '1900-01-01';
    const periodTo = toDate || '2999-12-31';

    // "Acumulado" = desde el inicio del ejercicio contable (1 de enero del año
    // de la fecha inicial) hasta la fecha final del período consultado.
    const accumulatedFrom = fromDate
      ? `${fromDate.slice(0, 4)}-01-01`
      : '1900-01-01';

    // Naturaleza de respaldo según el Nomenclador de Cuentas 2016 cuando la
    // cuenta no está catalogada: elementos 1-3 y 8 son deudoras, el resto
    // acreedoras.
    const natureFallback = `CASE WHEN LEFT(vl.account_code, 1) IN ('1','2','3','8')
                                 THEN 'deudora' ELSE 'acreedora' END`;

    // Clave de agrupación:
    //  · Detalle (por defecto): la subcuenta cuando existe, si no la cuenta.
    //  · Solo cuentas: la cuenta de mayor, descartando el sufijo analítico
    //    (`405-0060` → `405`) presente en asientos antiguos.
    const accountsOnly = options?.accountsOnly === true;
    const groupKey = accountsOnly
      ? `SPLIT_PART(vl.account_code, '-', 1)`
      : `COALESCE(NULLIF(vl.subaccount_code, ''), vl.account_code)`;
    // En modo "solo cuentas" la descripción debe ser la de la cuenta de mayor,
    // no la de la subcuenta a la que apunta `vl.account_id`.
    const nameExpr = accountsOnly
      ? `MAX(COALESCE(pa.name, vl.account_name))`
      : `MAX(COALESCE(NULLIF(vl.subaccount_name, ''), a.name, vl.account_name))`;
    const parentJoin = accountsOnly
      ? `LEFT JOIN accounts pa ON pa.code = SPLIT_PART(vl.account_code, '-', 1)
                             AND pa."companyId" = $1`
      : '';

    const statuses = this.voucherStatuses(options?.includeDrafts);
    // 'cierre' se excluye cuando se pide el balance previo al cierre.
    const excludedTypes = options?.beforeClosing ? ['cierre'] : [];

    const rows: any[] = await this.voucherLineRepo.query(
      `
      SELECT
        ${groupKey} AS "accountCode",
        ${nameExpr} AS "accountName",
        MAX(COALESCE(a.nature, ${natureFallback})) AS "nature",
        MAX(COALESCE(a.type, '')) AS "accountType",
        COALESCE(SUM(CASE WHEN v.date >= $2 AND v.date <= $3 THEN vl.debit ELSE 0 END), 0) AS "periodDebit",
        COALESCE(SUM(CASE WHEN v.date >= $2 AND v.date <= $3 THEN vl.credit ELSE 0 END), 0) AS "periodCredit",
        COALESCE(SUM(CASE WHEN v.date >= $4 AND v.date <= $3 THEN vl.debit ELSE 0 END), 0) AS "accumulatedDebit",
        COALESCE(SUM(CASE WHEN v.date >= $4 AND v.date <= $3 THEN vl.credit ELSE 0 END), 0) AS "accumulatedCredit",
        COALESCE(SUM(CASE WHEN v.date < $2 THEN vl.debit ELSE 0 END), 0) AS "openingDebit",
        COALESCE(SUM(CASE WHEN v.date < $2 THEN vl.credit ELSE 0 END), 0) AS "openingCredit"
      FROM voucher_lines vl
      INNER JOIN vouchers v ON v.id = vl.voucher_id
      LEFT JOIN accounts a ON a.id = vl.account_id
      ${parentJoin}
      WHERE v.company_id = $1
        AND v.status = ANY($5)
        AND NOT (v.type = ANY($6))
        AND v.date <= $3
      GROUP BY ${groupKey}
      ORDER BY ${groupKey} ASC
      `,
      [
        companyId,
        periodFrom,
        periodTo,
        accumulatedFrom,
        statuses,
        excludedTypes,
      ],
    );

    return rows
      .map((row: any) => {
        const nature: 'deudora' | 'acreedora' =
          row.nature === 'acreedora' ? 'acreedora' : 'deudora';
        const periodDebit = Number(row.periodDebit || 0);
        const periodCredit = Number(row.periodCredit || 0);
        const accumulatedDebit = Number(row.accumulatedDebit || 0);
        const accumulatedCredit = Number(row.accumulatedCredit || 0);
        const openingDebit = Number(row.openingDebit || 0);
        const openingCredit = Number(row.openingCredit || 0);

        const openingBalance =
          nature === 'deudora'
            ? openingDebit - openingCredit
            : openingCredit - openingDebit;
        const closingBalance =
          nature === 'deudora'
            ? openingBalance + (periodDebit - periodCredit)
            : openingBalance + (periodCredit - periodDebit);

        return {
          accountCode: row.accountCode,
          accountName: row.accountName || row.accountCode,
          nature,
          accountType: row.accountType || '',
          openingBalance,
          periodDebit,
          periodCredit,
          accumulatedDebit,
          accumulatedCredit,
          closingBalance,
        };
      })
      .filter(
        (row) =>
          row.periodDebit !== 0 ||
          row.periodCredit !== 0 ||
          row.accumulatedDebit !== 0 ||
          row.accumulatedCredit !== 0 ||
          row.openingBalance !== 0 ||
          row.closingBalance !== 0,
      );
  }

  async exportTrialBalanceExcel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
    options?: ReportOptions,
  ) {
    const data = await this.getTrialBalance(
      companyId,
      fromDate,
      toDate,
      options,
    );

    if (!data || data.length === 0) {
      throw new NotFoundException('No hay datos para generar el reporte');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Balance de Comprobación');

    // Cabecera de dos niveles: Cuenta (Número | Descripción),
    // Periodo (Débito | Crédito), Acumulado (Débito | Crédito).
    worksheet.columns = [
      { key: 'accountCode', width: 16 },
      { key: 'accountName', width: 45 },
      { key: 'periodDebit', width: 18 },
      { key: 'periodCredit', width: 18 },
      { key: 'accumulatedDebit', width: 18 },
      { key: 'accumulatedCredit', width: 18 },
    ];

    worksheet.getRow(1).values = ['Cuenta', '', 'Periodo', '', 'Acumulado', ''];
    worksheet.getRow(2).values = [
      'Número',
      'Descripción',
      'Débito',
      'Crédito',
      'Débito',
      'Crédito',
    ];
    worksheet.mergeCells('A1:B1');
    worksheet.mergeCells('C1:D1');
    worksheet.mergeCells('E1:F1');

    // Data
    data.forEach((row) => {
      worksheet.addRow({
        accountCode: row.accountCode,
        accountName: row.accountName,
        periodDebit: row.periodDebit,
        periodCredit: row.periodCredit,
        accumulatedDebit: row.accumulatedDebit,
        accumulatedCredit: row.accumulatedCredit,
      });
    });

    // Totals
    const totalRow = worksheet.addRow({
      accountCode: 'TOTALES',
      periodDebit: data.reduce((sum, row) => sum + row.periodDebit, 0),
      periodCredit: data.reduce((sum, row) => sum + row.periodCredit, 0),
      accumulatedDebit: data.reduce(
        (sum, row) => sum + row.accumulatedDebit,
        0,
      ),
      accumulatedCredit: data.reduce(
        (sum, row) => sum + row.accumulatedCredit,
        0,
      ),
    });

    // Style
    [1, 2].forEach((rowNumber) => {
      const row = worksheet.getRow(rowNumber);
      row.font = { bold: true };
      row.alignment = { horizontal: 'center', vertical: 'middle' };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6B8' },
      };
    });
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
      return;
    }

    return workbook;
  }

  // ══════════════════════════════════════════════════════════
  // ── BALANCE SHEET ──
  // ══════════════════════════════════════════════════════════

  async getBalanceSheet(
    companyId: number,
    asOfDate?: string,
    options?: ReportOptions,
  ) {
    const cacheKey = `reports:${companyId}:balance-sheet:${asOfDate || 'all'}:${this.optionsCacheKey(options)}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this._getBalanceSheet(companyId, asOfDate, options),
      ReportService.CACHE_TTL,
    );
  }

  private async _getBalanceSheet(
    companyId: number,
    asOfDate?: string,
    options?: ReportOptions,
  ) {
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
      .where('v.companyId = :companyId', { companyId });

    this.applyVoucherFilters(qb, options);

    if (asOfDate) {
      qb.andWhere('v.date <= :asOfDate', { asOfDate });
    }

    qb.groupBy('a.type, a.nature, vl.account_code, vl.account_name')
      .orderBy('a.type')
      .addOrderBy('vl.account_code');

    const results = await qb.getRawMany();

    const nonZero = results.filter((r) => Number(r.balance || 0) !== 0);
    const assets = nonZero.filter((r) => r.accountType === 'asset');
    const liabilities = nonZero.filter((r) => r.accountType === 'liability');
    const equity = nonZero.filter((r) => r.accountType === 'equity');

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
    options?: ReportOptions,
  ) {
    const data = await this.getBalanceSheet(companyId, asOfDate, options);

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
      return;
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
    options?: ReportOptions,
  ) {
    const cacheKey = `reports:${companyId}:income-statement:${fromDate || 'all'}:${toDate || 'all'}:${this.optionsCacheKey(options)}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this._getIncomeStatement(companyId, fromDate, toDate, options),
      ReportService.CACHE_TTL,
    );
  }

  private async _getIncomeStatement(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
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
      .andWhere('a.type IN (:...types)', { types: ['income', 'expense'] });

    this.applyVoucherFilters(qb, options);

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.groupBy('a.type, vl.account_code, vl.account_name')
      .orderBy('a.type')
      .addOrderBy('vl.account_code');

    const results = await qb.getRawMany();

    const income = results.filter((r) => r.accountType === 'income' && Number(r.totalCredit || 0) !== 0);
    const expenses = results.filter((r) => r.accountType === 'expense' && Number(r.totalDebit || 0) !== 0);

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
    options?: ReportOptions,
  ) {
    const data = await this.getIncomeStatement(
      companyId,
      fromDate,
      toDate,
      options,
    );

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
      return;
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
    options?: ReportOptions,
  ) {
    const cacheKey = `reports:${companyId}:expense-breakdown:${fromDate || 'all'}:${toDate || 'all'}:${this.optionsCacheKey(options)}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this._getExpenseBreakdown(companyId, fromDate, toDate, options),
      ReportService.CACHE_TTL,
    );
  }

  private async _getExpenseBreakdown(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('vl.element', 'element')
      .addSelect('vl.element_name', 'elementName')
      .addSelect('SUM(vl.debit)', 'totalExpense')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('a.type = :type', { type: 'expense' })
      .andWhere('vl.element IS NOT NULL');

    this.applyVoucherFilters(qb, options);

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.groupBy('vl.element, vl.element_name').orderBy('"totalExpense"', 'DESC');

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
    options?: ReportOptions,
  ) {
    const data = await this.getExpenseBreakdown(
      companyId,
      fromDate,
      toDate,
      options,
    );

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
      return;
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
    const qb = this.voucherRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.lines', 'lines')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    qb.orderBy('v.date', 'ASC').addOrderBy('v.voucherNumber', 'ASC');

    return qb.getMany();
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
    options?: ReportOptions,
  ) {
    const accounts = await this.getTrialBalance(
      companyId,
      fromDate,
      toDate,
      options,
    );

    if (!accounts || accounts.length === 0) {
      throw new NotFoundException('No hay datos para generar el reporte');
    }

    const totals = accounts.reduce(
      (acc, a) => ({
        periodDebit: acc.periodDebit + a.periodDebit,
        periodCredit: acc.periodCredit + a.periodCredit,
        accumulatedDebit: acc.accumulatedDebit + a.accumulatedDebit,
        accumulatedCredit: acc.accumulatedCredit + a.accumulatedCredit,
      }),
      {
        periodDebit: 0,
        periodCredit: 0,
        accumulatedDebit: 0,
        accumulatedCredit: 0,
      },
    );

    const company = await this.companyRepo.findOne({ where: { id: companyId } });

    const doc = new jsPDF({
      orientation: this.pdfOrientation(options),
      unit: 'mm',
      format: 'a4',
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Geometría de la tabla: Cuenta (Número | Descripción),
    // Periodo (Débito | Crédito), Acumulado (Débito | Crédito).
    // Los anchos base son los de A4 vertical y se reescalan al ancho útil
    // real, de modo que en horizontal la tabla también ocupe toda la página.
    const startX = 10;
    const baseWidths = [22, 56, 29, 29, 29, 29];
    const scale =
      (pageWidth - startX * 2) / baseWidths.reduce((a, b) => a + b, 0);
    const colWidths = baseWidths.map((w) => w * scale);
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const colX: number[] = [];
    colWidths.reduce((x, w) => {
      colX.push(x);
      return x + w;
    }, startX);
    const rowHeight = 6;

    const right = (i: number) => colX[i] + colWidths[i] - 2;

    const drawHeader = (): number => {
      let y = 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('BALANCE DE COMPROBACIÓN', pageWidth / 2, y, {
        align: 'center',
      });

      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      if (company?.name) {
        doc.text(company.name, pageWidth / 2, y, { align: 'center' });
        y += 5;
      }
      doc.text(
        `Período: ${fromDate || 'Inicio'} al ${toDate || 'Actual'}${this.optionsNote(options)}`,
        pageWidth / 2,
        y,
        { align: 'center' },
      );

      // Cabecera de dos niveles
      const top = y + 5;
      const mid = top + rowHeight;
      const bottom = mid + rowHeight;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');

      // Nivel 1: grupos
      const groups: { label: string; from: number; to: number }[] = [
        { label: 'Cuenta', from: 0, to: 1 },
        { label: 'Periodo', from: 2, to: 3 },
        { label: 'Acumulado', from: 4, to: 5 },
      ];
      groups.forEach((g) => {
        const x1 = colX[g.from];
        const x2 = colX[g.to] + colWidths[g.to];
        doc.rect(x1, top, x2 - x1, rowHeight);
        doc.text(g.label, (x1 + x2) / 2, top + 4.2, { align: 'center' });
      });

      // Nivel 2: columnas
      const subHeaders = [
        'Número',
        'Descripción',
        'Débito',
        'Crédito',
        'Débito',
        'Crédito',
      ];
      subHeaders.forEach((label, i) => {
        doc.rect(colX[i], mid, colWidths[i], rowHeight);
        doc.text(label, colX[i] + colWidths[i] / 2, mid + 4.2, {
          align: 'center',
        });
      });

      doc.setFont('helvetica', 'normal');
      return bottom;
    };

    let y = drawHeader();

    accounts.forEach((account: any) => {
      if (y + rowHeight > pageHeight - 18) {
        doc.addPage();
        y = drawHeader();
      }

      // Solo líneas verticales de columnas, sin líneas divisorias horizontales
      const xEnd = colX[colWidths.length - 1] + colWidths[colWidths.length - 1];
      for (let i = 0; i < colX.length; i++) {
        doc.line(colX[i], y, colX[i], y + rowHeight);
      }
      doc.line(xEnd, y, xEnd, y + rowHeight);

      const textY = y + 4.2;
      doc.text(String(account.accountCode ?? ''), colX[0] + 2, textY);
      doc.text(
        doc.splitTextToSize(String(account.accountName ?? ''), colWidths[1] - 4)[0] ?? '',
        colX[1] + 2,
        textY,
      );
      doc.text(this.formatCurrency(account.periodDebit), right(2), textY, {
        align: 'right',
      });
      doc.text(this.formatCurrency(account.periodCredit), right(3), textY, {
        align: 'right',
      });
      doc.text(this.formatCurrency(account.accumulatedDebit), right(4), textY, {
        align: 'right',
      });
      doc.text(
        this.formatCurrency(account.accumulatedCredit),
        right(5),
        textY,
        { align: 'right' },
      );

      y += rowHeight;
    });

    // Fila de totales
    if (y + rowHeight > pageHeight - 18) {
      doc.addPage();
      y = drawHeader();
    }
    doc.setFont('helvetica', 'bold');
    // Bordes completos en la fila de totales (arriba, abajo y verticales)
    const xEnd = colX[colWidths.length - 1] + colWidths[colWidths.length - 1];
    doc.line(colX[0], y, xEnd, y);
    for (let i = 0; i < colX.length; i++) {
      doc.line(colX[i], y, colX[i], y + rowHeight);
    }
    doc.line(xEnd, y, xEnd, y + rowHeight);
    doc.line(colX[0], y + rowHeight, xEnd, y + rowHeight);
    const totalsY = y + 4.2;
    doc.text('TOTALES', colX[0] + 2, totalsY);
    doc.text(this.formatCurrency(totals.periodDebit), right(2), totalsY, {
      align: 'right',
    });
    doc.text(this.formatCurrency(totals.periodCredit), right(3), totalsY, {
      align: 'right',
    });
    doc.text(this.formatCurrency(totals.accumulatedDebit), right(4), totalsY, {
      align: 'right',
    });
    doc.text(this.formatCurrency(totals.accumulatedCredit), right(5), totalsY, {
      align: 'right',
    });
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(7);
    doc.text(
      `Generado: ${new Date().toLocaleString('es-ES')}`,
      startX,
      pageHeight - 8,
    );
    doc.text(
      `Cuentas: ${accounts.length}`,
      startX + tableWidth,
      pageHeight - 8,
      { align: 'right' },
    );

    return this.sendPdf(
      doc,
      `balance-comprobacion-${new Date().toISOString().split('T')[0]}.pdf`,
      res,
    );
  }

  async exportBalanceSheetPDF(
    companyId: number,
    asOfDate?: string,
    res?: Response,
    options?: ReportOptions,
  ) {
    const data = await this.getBalanceSheet(companyId, asOfDate, options);
    const company = await this.companyRepo.findOne({ where: { id: companyId } });

    const line = (r: any) => [
      r.accountCode,
      r.accountName,
      this.formatCurrency(r.balance),
    ];

    const doc = this.buildSectionPdf({
      title: 'Estado de Situación Financiera',
      subtitle: `Al: ${asOfDate || new Date().toISOString().split('T')[0]}${this.optionsNote(options)}`,
      companyName: company?.name,
      headers: ['Cuenta', 'Descripción', 'Importe'],
      widths: [28, 110, 44],
      aligns: ['left', 'left', 'right'],
      sections: [
        {
          title: 'ACTIVOS',
          rows: data.assets.map(line),
          totalLabel: 'TOTAL ACTIVOS',
          totalValues: ['', this.formatCurrency(data.totals.assets)],
        },
        {
          title: 'PASIVOS',
          rows: data.liabilities.map(line),
          totalLabel: 'TOTAL PASIVOS',
          totalValues: ['', this.formatCurrency(data.totals.liabilities)],
        },
        {
          title: 'PATRIMONIO',
          rows: data.equity.map(line),
          totalLabel: 'TOTAL PATRIMONIO',
          totalValues: ['', this.formatCurrency(data.totals.equity)],
        },
      ],
      grandTotalLabel: 'TOTAL PASIVO + PATRIMONIO',
      grandTotalValues: [
        '',
        this.formatCurrency(data.totals.liabilitiesAndEquity),
      ],
      orientation: this.pdfOrientation(options),
    });

    return this.sendPdf(
      doc,
      `estado-situacion-${new Date().toISOString().split('T')[0]}.pdf`,
      res,
    );
  }

  async exportIncomeStatementPDF(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
    options?: ReportOptions,
  ) {
    const data = await this.getIncomeStatement(
      companyId,
      fromDate,
      toDate,
      options,
    );
    const company = await this.companyRepo.findOne({ where: { id: companyId } });

    const line = (r: any) => [
      r.accountCode,
      r.accountName,
      this.formatCurrency(r.amount),
    ];

    const doc = this.buildSectionPdf({
      title: 'Estado de Rendimiento Financiero',
      subtitle: `Período: ${fromDate || 'Inicio'} al ${toDate || 'Actual'}${this.optionsNote(options)}`,
      companyName: company?.name,
      headers: ['Cuenta', 'Descripción', 'Importe'],
      widths: [28, 110, 44],
      aligns: ['left', 'left', 'right'],
      sections: [
        {
          title: 'INGRESOS',
          rows: data.income.map(line),
          totalLabel: 'TOTAL INGRESOS',
          totalValues: ['', this.formatCurrency(data.totals.totalIncome)],
        },
        {
          title: 'GASTOS',
          rows: data.expenses.map(line),
          totalLabel: 'TOTAL GASTOS',
          totalValues: ['', this.formatCurrency(data.totals.totalExpenses)],
        },
      ],
      grandTotalLabel:
        data.totals.netIncome >= 0 ? 'UTILIDAD NETA' : 'PÉRDIDA NETA',
      grandTotalValues: ['', this.formatCurrency(data.totals.netIncome)],
      orientation: this.pdfOrientation(options),
    });

    return this.sendPdf(
      doc,
      `estado-rendimiento-${new Date().toISOString().split('T')[0]}.pdf`,
      res,
    );
  }

  async exportExpenseBreakdownPDF(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
    options?: ReportOptions,
  ) {
    const data = await this.getExpenseBreakdown(
      companyId,
      fromDate,
      toDate,
      options,
    );
    const company = await this.companyRepo.findOne({ where: { id: companyId } });

    const doc = this.buildSectionPdf({
      title: 'Gastos por Subelementos',
      subtitle: `Período: ${fromDate || 'Inicio'} al ${toDate || 'Actual'}${this.optionsNote(options)}`,
      companyName: company?.name,
      headers: ['Elemento', 'Descripción', 'Importe', '%'],
      widths: [26, 90, 40, 26],
      aligns: ['left', 'left', 'right', 'right'],
      sections: [
        {
          title: 'DESGLOSE DE GASTOS',
          rows: data.expenses.map((e) => [
            e.element,
            e.elementName,
            this.formatCurrency(e.amount),
            `${e.percentage.toFixed(2)} %`,
          ]),
        },
      ],
      grandTotalLabel: 'TOTAL GASTOS',
      grandTotalValues: [
        '',
        this.formatCurrency(data.totalExpenses),
        '100.00 %',
      ],
      orientation: this.pdfOrientation(options),
    });

    return this.sendPdf(
      doc,
      `gastos-subelementos-${new Date().toISOString().split('T')[0]}.pdf`,
      res,
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── MODELO 5920 (Estado de Situación) ──
  // ══════════════════════════════════════════════════════════

  async exportModelo5920Excel(
    companyId: number,
    asOfDate?: string,
    res?: Response,
    options?: ReportOptions,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5920.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    // Se reutilizan los datos del PDF para que ambos formatos no puedan
    // divergir. Antes esta función repetía los cálculos con rangos distintos y
    // el resultado del período se leía de 800-899, que son cuentas de gasto.
    const d = await this.getEfe5920Data(companyId, asOfDate, options);
    const { activos, pasivos, patrimonio } = d;

    // La plantilla ya trae las fórmulas de los subtotales, así que solo se
    // escriben las celdas de detalle de la columna K.
    ws.getCell('K11').value = activos.efectivoCaja.real;
    ws.getCell('K12').value = activos.efectivoBanco.real;
    ws.getCell('K13').value = activos.cuentasXCobrarCP.real;
    ws.getCell('K14').value = activos.pagosAnticipadosSuministros.real;
    ws.getCell('K15').value = activos.adeudosPresupuesto.real;
    ws.getCell('K17').value = activos.materiasPrimas.real;
    ws.getCell('K18').value = activos.utilesHerramientas.real;
    ws.getCell('K19').value = activos.alimentos.real;
    ws.getCell('K21').value = activos.activosFijosTangibles.real;
    ws.getCell('K22').value = activos.depreciacionAFT.real;
    ws.getCell('K23').value = activos.activosDiferidos.real;
    ws.getCell('K24').value = activos.gastosFaltantesDiferidos.real;
    ws.getCell('K25').value = activos.otrosActivos.real;
    ws.getCell('K26').value = activos.cuentasXCobrarDiversas.real;
    ws.getCell('K30').value = pasivos.cuentasXPagarCP.real;
    ws.getCell('K31').value = pasivos.dividendosXPagar.real;
    ws.getCell('K32').value = pasivos.obligacionesPresupuesto.real;
    ws.getCell('K33').value = pasivos.nominasXPagar.real;
    ws.getCell('K34').value = pasivos.gastosAcumuladosXPagar.real;
    ws.getCell('K35').value = pasivos.provisionVacaciones.real;
    ws.getCell('K36').value = pasivos.provisionSeguridadSocial.real;
    ws.getCell('K39').value = pasivos.cuentasXPagarDiversas.real;
    ws.getCell('K42').value = patrimonio.inversionEstatal.real;
    ws.getCell('K43').value = patrimonio.reservasContingencias.real;
    ws.getCell('K44').value = patrimonio.otrasReservas.real;
    ws.getCell('K45').value = patrimonio.pagoUtilidades.real;
    ws.getCell('K46').value = patrimonio.pagoDividendos.real;

    // El resultado del período es la partida de cuadre. Se calcula con las
    // mismas fórmulas de la plantilla —cuyo TOTAL DEL ACTIVO es K10+K20 y su
    // TOTAL DE PATRIMONIO es SUM(K42:K47)— para que la hoja exportada cuadre.
    // No se toma `patrimonio.resultadoPeriodo`, que parte de un total del
    // activo distinto (incluye diferidos y otros activos).
    const totalActivoPlantilla =
      activos.activosCirculantes.real + activos.activosFijos.real;
    const patrimonioSinResultado =
      patrimonio.inversionEstatal.real +
      patrimonio.reservasContingencias.real +
      patrimonio.otrasReservas.real +
      patrimonio.pagoUtilidades.real +
      patrimonio.pagoDividendos.real;
    ws.getCell('K47').value =
      totalActivoPlantilla - pasivos.totalPasivo.real - patrimonioSinResultado;

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
    options?: ReportOptions,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5921.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    // Fuente única compartida con el PDF. Las filas de subtotal (11, 13, 14,
    // 17 y 26) no se escriben: la plantilla ya las calcula con sus fórmulas.
    const { lineas } = await this.getEfe5921Data(
      companyId,
      fromDate,
      toDate,
      options,
    );

    ws.getCell('K9').value = lineas.ventas.real;
    ws.getCell('K10').value = lineas.impuestoVentas.real;
    ws.getCell('K12').value = lineas.costoVentasProduccion.real;
    ws.getCell('K15').value = lineas.gastosGeneralesAdministracion.real;
    ws.getCell('K16').value = lineas.gastosOperacion.real;
    ws.getCell('K18').value = lineas.gastosFinancieros.real;
    ws.getCell('K19').value = lineas.gastosPerdidas.real;
    ws.getCell('K20').value = lineas.gastosPerdidasDesastres.real;
    ws.getCell('K21').value = lineas.otrosImpuestosTasas.real;
    ws.getCell('K22').value = lineas.otrosGastos.real;
    ws.getCell('K23').value = lineas.gastosRecuperacionDesastres.real;
    ws.getCell('K24').value = lineas.ingresosFinancieros.real;
    ws.getCell('K25').value = lineas.otrosIngresos.real;

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
    options?: ReportOptions,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5924.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    // Obtener elementos con datos en el período
    const elementosQuery = this.voucherLinesQuery(companyId, options)
      .select('vl.element', 'elementCode')
      .addSelect('vl.element_name', 'elementName')
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
        options,
      );
      const totalElementoVal = totalElemento.debit - totalElemento.credit;

      ws.getCell(`A${currentRow}`).value = elemento.elementCode;
      ws.getCell(`B${currentRow}`).value = elemento.elementName;
      ws.getCell(`C${currentRow}`).value = totalElementoVal;
      currentRow++;

      // Obtener subelementos de este elemento
      const subelementosQuery = this.voucherLinesQuery(companyId, options)
        .select('vl.subelement', 'subelementCode')
        .addSelect('vl.subelement_name', 'subelementName')
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
          options,
        );
        const totalSubelementoVal =
          totalSubelemento.debit - totalSubelemento.credit;
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
    const cacheKey = `reports:${companyId}:kpis`;
    return this.cacheService.getOrSet(cacheKey, () => this._getFinancialKPIs(companyId), 120); // 2 min TTL for KPIs
  }

  private async _getFinancialKPIs(companyId: number) {
    const balanceSheet = await this._getBalanceSheet(companyId);
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
      currency: 'CUP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  /**
   * Expresión SQL con la cuenta de mayor de una partida. Los asientos antiguos
   * guardan la subcuenta analítica en `account_code` (`405-0060`), por lo que
   * hay que descartar el sufijo antes de compararla con un rango numérico.
   */
  private static readonly LEDGER_CODE_SQL =
    "SPLIT_PART(vl.account_code, '-', 1)";

  /**
   * Traduce una lista de rangos (`'405-415'`) o códigos sueltos (`'154'`) en un
   * predicado SQL sobre la columna indicada.
   */
  private applyCodeRanges(
    qb: SelectQueryBuilder<any>,
    codeRanges: string[],
    column: string = ReportService.LEDGER_CODE_SQL,
  ): void {
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    codeRanges.forEach((range, i) => {
      const parts = range.split('-').map((s) => s.trim());
      if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        conditions.push(
          `(${column} ~ '^[0-9]+$' AND CAST(${column} AS INTEGER) >= :from${i} AND CAST(${column} AS INTEGER) <= :to${i})`,
        );
        params[`from${i}`] = parseInt(parts[0], 10);
        params[`to${i}`] = parseInt(parts[1], 10);
      } else {
        conditions.push(`${column} = :code${i}`);
        params[`code${i}`] = range.trim();
      }
    });

    if (conditions.length > 0) {
      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }
  }

  /**
   * Consulta base de partidas de una empresa con los filtros de informe
   * (estado del comprobante y exclusión de asientos de cierre) ya aplicados.
   */
  private voucherLinesQuery(
    companyId: number,
    options?: ReportOptions,
  ): SelectQueryBuilder<VoucherLine> {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId });

    return this.applyVoucherFilters(qb, options);
  }

  private async getAccountRangeBalance(
    companyId: number,
    codeRanges: string[],
    asOfDate?: string,
    options?: ReportOptions,
  ): Promise<number> {
    const qb = this.voucherLinesQuery(companyId, options).select(
      'COALESCE(SUM(vl.debit), 0) - COALESCE(SUM(vl.credit), 0)',
      'balance',
    );

    if (asOfDate) qb.andWhere('v.date <= :asOfDate', { asOfDate });
    this.applyCodeRanges(qb, codeRanges);

    const result = await qb.getRawOne();
    return Number(result?.balance || 0);
  }

  /**
   * Saldo de un rango de cuentas acreedoras, expresado en positivo.
   *
   * Se invierte el signo en lugar de tomar el valor absoluto: así un pasivo o
   * patrimonio con saldo deudor —indicio de un asiento mal registrado— se
   * presenta en negativo y queda visible, en vez de enmascararse.
   */
  private async getAccountRangeBalanceCredit(
    companyId: number,
    codeRanges: string[],
    asOfDate?: string,
    options?: ReportOptions,
  ): Promise<number> {
    const balance = await this.getAccountRangeBalance(
      companyId,
      codeRanges,
      asOfDate,
      options,
    );
    return -balance;
  }

  private async getAccountRangePeriodAmount(
    companyId: number,
    codeRanges: string[],
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ): Promise<{ debit: number; credit: number }> {
    const qb = this.voucherLinesQuery(companyId, options)
      .select('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit');

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });
    this.applyCodeRanges(qb, codeRanges);

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
    options?: ReportOptions,
  ): Promise<{ debit: number; credit: number }> {
    const qb = this.voucherLinesQuery(companyId, options)
      .select('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit');

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

  /**
   * Gasto del período agrupado por rangos de subelemento del nomenclador
   * (`'50100'`, `'80040-80044'`…). Es la fuente correcta para el modelo 5924,
   * que se estructura por subelementos de gasto y no por cuentas de mayor.
   */
  private async getSubelementRangeAmount(
    companyId: number,
    subelementRanges: string[],
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ): Promise<number> {
    const qb = this.voucherLinesQuery(companyId, options).select(
      'COALESCE(SUM(vl.debit), 0) - COALESCE(SUM(vl.credit), 0)',
      'total',
    );

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });
    this.applyCodeRanges(qb, subelementRanges, 'vl.subelement');

    const result = await qb.getRawOne();
    return Number(result?.total || 0);
  }

  /**
   * Encabezado común de los modelos SIEN con los datos reales de la empresa.
   * El código de centro informante se toma del NIT registrado.
   */
  private async sienHeader(
    companyId: number,
    date: string,
  ): Promise<{
    informeCorrespondiente: string;
    codigoCentroInformante: string;
    centroInformante: string;
    fechaDia: string;
    fechaMes: string;
    fechaAnio: string;
  }> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    const monthNames = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    const d = new Date(date);

    return {
      informeCorrespondiente: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
      codigoCentroInformante: company?.taxId ?? '',
      centroInformante: company?.name ?? '',
      fechaDia: d.getDate().toString(),
      fechaMes: (d.getMonth() + 1).toString(),
      fechaAnio: d.getFullYear().toString(),
    };
  }

  /**
   * Invalidate all cached reports for a company.
   * Call this when vouchers are posted, cancelled, or deleted.
   */
  async invalidateCompanyCache(companyId: number): Promise<void> {
    await this.cacheService.invalidatePattern(`reports:${companyId}:*`);
  }

  // ══════════════════════════════════════════════════════════
  // ── GENERATED REPORTS CRUD ──
  // ══════════════════════════════════════════════════════════

  async getGeneratedReports(companyId: number) {
    return this.generatedReportRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
  }

  async saveGeneratedReport(
    companyId: number,
    reportData: {
      type: string;
      title: string;
      description?: string;
      generatedBy?: string;
      data: any;
      period?: any;
      options?: any;
    },
  ) {
    const report = this.generatedReportRepo.create({
      companyId,
      type: reportData.type,
      title: reportData.title,
      description: reportData.description || null,
      generatedBy: reportData.generatedBy || 'Usuario',
      data: reportData.data,
      period: reportData.period || null,
      options: reportData.options || null,
    });
    return this.generatedReportRepo.save(report);
  }

  async deleteGeneratedReport(companyId: number, reportId: string) {
    const report = await this.generatedReportRepo.findOne({
      where: { id: reportId, companyId },
    });
    if (!report) {
      throw new NotFoundException('Informe no encontrado');
    }
    await this.generatedReportRepo.remove(report);
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════
  // ── PDF MODELO 5920 DATA ──
  // ══════════════════════════════════════════════════════════

  async getEfe5920Data(
    companyId: number,
    asOfDate?: string,
    options?: ReportOptions,
  ): Promise<Efe5920Data> {
    const today = new Date().toISOString().split('T')[0];
    const date = asOfDate || today;
    const balance = (codes: string[]) =>
      this.getAccountRangeBalance(companyId, codes, date, options);
    const balanceCredit = (codes: string[]) =>
      this.getAccountRangeBalanceCredit(companyId, codes, date, options);

    // ACTIVO
    const efectivoCaja = await balance(['101-108']);
    const efectivoBanco = await balance(['109-119']);
    const cxcCorto = await balance(['135-139', '154']);
    const pagosAnticipadosSumin = await balance(['146-149']);
    const adeudosPresupuesto = await balance(['164-166']);
    const materiasPrimas = await balance(['183']);
    const utilesHerramientas = await balance(['187']);
    const alimentos = await balance(['193']);
    const aftTangibles = await balance(['240-251']);
    const depreciacionAft = await balanceCredit(['375-388']);
    const gastosDeficit = await balance(['312']);
    const cxcDiversas = await balance(['334-341']);

    // PASIVO
    const cxpCorto = await balanceCredit(['405-415']);
    const dividendosXPagar = await balanceCredit(['417']);
    const obligacionesPresupuesto = await balanceCredit(['440-449']);
    const nominasXPagar = await balanceCredit(['455-459']);
    const gastosAcumuladosXPagar = await balanceCredit(['480-489']);
    const provisionVacaciones = await balanceCredit(['492']);
    const provisionSeguridadSocial = await balanceCredit(['500']);
    const cuentasXPagarDiversas = await balanceCredit(['565-569']);

    // PATRIMONIO
    const inversionEstatal = await balanceCredit(['600-612']);
    const reservasContingencias = await balanceCredit(['645']);
    const otrasReservas = await balanceCredit(['646-654']);
    const pagoUtilidades = await balanceCredit(['690']);
    const pagoDividendos = await balanceCredit(['691']);

    // TOTALES
    const totalInventarios = materiasPrimas + utilesHerramientas + alimentos;
    const activosCirculantes = efectivoCaja + efectivoBanco + cxcCorto + pagosAnticipadosSumin + adeudosPresupuesto + totalInventarios;
    const activosFijos = aftTangibles - depreciacionAft;
    // El modelo separa dos epígrafes: "Activos Diferidos", cuyo detalle son los
    // gastos y faltantes diferidos, y "Otros Activos", cuyo detalle son las
    // cuentas por cobrar diversas. Antes se sumaban ambos en `activosDiferidos`
    // y además `gastosDeficit` se contaba una segunda vez en el total.
    const activosDiferidos = gastosDeficit;
    const otrosActivos = cxcDiversas;
    const totalActivo =
      activosCirculantes + activosFijos + activosDiferidos + otrosActivos;

    const pasivosCirculantes = cxpCorto + dividendosXPagar + obligacionesPresupuesto + nominasXPagar + gastosAcumuladosXPagar + provisionVacaciones + provisionSeguridadSocial;
    const otrosPasivos = cuentasXPagarDiversas;
    const totalPasivo = pasivosCirculantes + otrosPasivos;

    const totalPatrimonio = inversionEstatal + reservasContingencias + otrasReservas + pagoUtilidades + pagoDividendos;
    const resultadoPeriodo = totalActivo - (totalPasivo + totalPatrimonio);
    const totalPasivoYPatrimonio = totalPasivo + totalPatrimonio + resultadoPeriodo;

    return {
      ...(await this.sienHeader(companyId, date)),

      activos: {
        activosCirculantes: { planAnual: 0, apertura: 0, real: activosCirculantes },
        efectivoCaja: { planAnual: 0, apertura: 0, real: efectivoCaja },
        efectivoBanco: { planAnual: 0, apertura: 0, real: efectivoBanco },
        cuentasXCobrarCP: { planAnual: 0, apertura: 0, real: cxcCorto },
        pagosAnticipadosSuministros: { planAnual: 0, apertura: 0, real: pagosAnticipadosSumin },
        adeudosPresupuesto: { planAnual: 0, apertura: 0, real: adeudosPresupuesto },
        totalInventarios: { planAnual: 0, apertura: 0, real: totalInventarios },
        materiasPrimas: { planAnual: 0, apertura: 0, real: materiasPrimas },
        utilesHerramientas: { planAnual: 0, apertura: 0, real: utilesHerramientas },
        alimentos: { planAnual: 0, apertura: 0, real: alimentos },
        activosFijos: { planAnual: 0, apertura: 0, real: activosFijos },
        activosFijosTangibles: { planAnual: 0, apertura: 0, real: aftTangibles },
        depreciacionAFT: { planAnual: 0, apertura: 0, real: depreciacionAft },
        activosDiferidos: { planAnual: 0, apertura: 0, real: activosDiferidos },
        gastosFaltantesDiferidos: { planAnual: 0, apertura: 0, real: gastosDeficit },
        otrosActivos: { planAnual: 0, apertura: 0, real: otrosActivos },
        cuentasXCobrarDiversas: { planAnual: 0, apertura: 0, real: cxcDiversas },
        totalActivo: { planAnual: 0, apertura: 0, real: totalActivo },
      },
      
      pasivos: {
        pasivosCirculantes: { planAnual: 0, apertura: 0, real: pasivosCirculantes },
        cuentasXPagarCP: { planAnual: 0, apertura: 0, real: cxpCorto },
        dividendosXPagar: { planAnual: 0, apertura: 0, real: dividendosXPagar },
        obligacionesPresupuesto: { planAnual: 0, apertura: 0, real: obligacionesPresupuesto },
        nominasXPagar: { planAnual: 0, apertura: 0, real: nominasXPagar },
        gastosAcumuladosXPagar: { planAnual: 0, apertura: 0, real: gastosAcumuladosXPagar },
        provisionVacaciones: { planAnual: 0, apertura: 0, real: provisionVacaciones },
        provisionSeguridadSocial: { planAnual: 0, apertura: 0, real: provisionSeguridadSocial },
        otrosPasivos: { planAnual: 0, apertura: 0, real: otrosPasivos },
        cuentasXPagarDiversas: { planAnual: 0, apertura: 0, real: cuentasXPagarDiversas },
        totalPasivo: { planAnual: 0, apertura: 0, real: totalPasivo },
      },
      
      patrimonio: {
        inversionEstatal: { planAnual: 0, apertura: 0, real: inversionEstatal },
        reservasContingencias: { planAnual: 0, apertura: 0, real: reservasContingencias },
        otrasReservas: { planAnual: 0, apertura: 0, real: otrasReservas },
        pagoUtilidades: { planAnual: 0, apertura: 0, real: pagoUtilidades },
        pagoDividendos: { planAnual: 0, apertura: 0, real: pagoDividendos },
        resultadoPeriodo: { planAnual: 0, apertura: 0, real: resultadoPeriodo },
        totalPatrimonio: { planAnual: 0, apertura: 0, real: totalPatrimonio },
        totalPasivoYPatrimonio: { planAnual: 0, apertura: 0, real: totalPasivoYPatrimonio },
      },

      hechoNombre: '',
      aprobadoNombre: '',
      observaciones: '',
    };
  }

  async getEfe5921Data(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ): Promise<Efe5921Data> {
    const today = new Date().toISOString().split('T')[0];
    const fd = fromDate || today;
    const td = toDate || today;
    const amount = (codes: string[]) =>
      this.getAccountRangePeriodAmount(companyId, codes, fd, td, options);

    /** Saldo neto deudor de un rango de cuentas de gasto. */
    const debitOf = async (codes: string[]) => {
      const r = await amount(codes);
      return r.debit - r.credit;
    };
    /** Saldo neto acreedor de un rango de cuentas de ingreso. */
    const creditOf = async (codes: string[]) => {
      const r = await amount(codes);
      return r.credit - r.debit;
    };

    // Los rangos de cada línea los rotula el propio formulario oficial en la
    // columna de indicadores ("Ventas (900-913)", "Gastos Financieros
    // (835-838)"…) y coinciden uno a uno con el nomenclador, así que no deben
    // alterarse. La versión anterior usaba rangos inventados que además
    // mezclaban conceptos: 930-934 se rotulaba "subvenciones" cuando son
    // Ingresos por Sobrantes, 820-821 se rotulaba "gastos de personal" cuando
    // son Gastos de Distribución y Ventas, y 945-949 no contiene ninguna
    // cuenta del nomenclador.
    const ventas = await creditOf(['900-913']);
    const impuestoVentas = await debitOf(['805-809']);
    const costoVentasProduccion = await debitOf(['810-813']);
    const gastosGeneralesAdministracion = await debitOf(['822-824']);
    const gastosOperacion = await debitOf(['826-833']);
    const gastosFinancieros = await debitOf(['835-838']);
    const gastosPerdidas = await debitOf(['845-848']);
    const gastosPerdidasDesastres = await debitOf(['849']);
    const otrosImpuestosTasas = await debitOf(['855-864']);
    const otrosGastos = await debitOf(['865-866']);
    const gastosRecuperacionDesastres = await debitOf(['873']);
    const ingresosFinancieros = await creditOf(['920-922']);
    const otrosIngresos = await creditOf(['950-952']);

    // Subtotales, calculados igual que las fórmulas de la plantilla oficial.
    const ventasNetas = ventas - impuestoVentas;
    const utilidadBrutaVentas = ventasNetas - costoVentasProduccion;
    const utilidadNetaVentas = utilidadBrutaVentas;
    // La plantilla define esta fila como "Utilidad Neta en Ventas menos Gastos
    // de Operación", sin restar los Gastos Generales y de Administración. Se
    // reproduce tal cual para no separarse del modelo oficial.
    const utilidadOperaciones = utilidadNetaVentas - gastosOperacion;
    const utilidadAntesImpuesto =
      utilidadOperaciones -
      gastosFinancieros -
      gastosPerdidas -
      gastosPerdidasDesastres -
      otrosImpuestosTasas -
      otrosGastos -
      gastosRecuperacionDesastres +
      ingresosFinancieros +
      otrosIngresos;

    // El plan anual y la apertura no se registran todavía en el sistema.
    const linea = (real: number) => ({ planAnual: 0, apertura: 0, real });

    return {
      ...(await this.sienHeader(companyId, fd)),

      lineas: {
        ventas: linea(ventas),
        impuestoVentas: linea(impuestoVentas),
        ventasNetas: linea(ventasNetas),
        costoVentasProduccion: linea(costoVentasProduccion),
        utilidadBrutaVentas: linea(utilidadBrutaVentas),
        utilidadNetaVentas: linea(utilidadNetaVentas),
        gastosGeneralesAdministracion: linea(gastosGeneralesAdministracion),
        gastosOperacion: linea(gastosOperacion),
        utilidadOperaciones: linea(utilidadOperaciones),
        gastosFinancieros: linea(gastosFinancieros),
        gastosPerdidas: linea(gastosPerdidas),
        gastosPerdidasDesastres: linea(gastosPerdidasDesastres),
        otrosImpuestosTasas: linea(otrosImpuestosTasas),
        otrosGastos: linea(otrosGastos),
        gastosRecuperacionDesastres: linea(gastosRecuperacionDesastres),
        ingresosFinancieros: linea(ingresosFinancieros),
        otrosIngresos: linea(otrosIngresos),
        utilidadAntesImpuesto: linea(utilidadAntesImpuesto),
      },

      hechoNombre: '',
      aprobadoNombre: '',
      observaciones: '',
    };
  }

  async getEfe5924Data(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ): Promise<Efe5924Data> {
    const today = new Date().toISOString().split('T')[0];
    const fd = fromDate || today;
    const td = toDate || today;
    const sub = (ranges: string[]) =>
      this.getSubelementRangeAmount(companyId, ranges, fd, td, options);

    // El modelo se estructura por subelementos de gasto, no por cuentas de
    // mayor. Los rangos anteriores apuntaban a cuentas de pasivo (505-515) y de
    // inventario (183-185), de modo que el informe no medía gasto alguno.
    const salarios = await sub(['50100']);
    const horasExtra = await sub(['50200', '50500']);
    const seguridadSocial = await sub(['50300', '50400']);
    const materiasPrimas = await sub(['11101-11109']);
    const materialesConstruccion = await sub(['11110-11119']);
    const suministrosOficina = await sub(['11150-11200']);
    const serviciosBasicos = await sub(['40100-40200', '80051', '80052']);
    const mantenimiento = await sub(['80040-80044']);
    const serviciosProfesionales = await sub(['80060-80066']);
    const depreciacion = await sub(['70100']);
    const amortizacion = await sub(['70200']);
    const gastosRepresentacion = await sub(['80010-80014']);
    const gastosTransporte = await sub(['30101-30140', '80055']);
    const gastosComunicacion = await sub(['80054']);

    const totalReal = [
      salarios, horasExtra, seguridadSocial,
      materiasPrimas, materialesConstruccion, suministrosOficina,
      serviciosBasicos, mantenimiento, serviciosProfesionales,
      depreciacion, amortizacion, gastosRepresentacion,
      gastosTransporte, gastosComunicacion,
    ].reduce((sum, val) => sum + val, 0);

    const porcReal = (value: number) =>
      totalReal > 0 ? (value / totalReal) * 100 : 0;

    // El plan anual y la apertura no se registran todavía en el sistema, por lo
    // que se dejan en cero. Antes se rellenaban con porcentajes inventados
    // sobre el total real, lo que daba la apariencia de un plan inexistente.
    const partida = (real: number) => ({
      planAnual: 0,
      apertura: 0,
      real,
      porcPlan: 0,
      porcApertura: 0,
      porcReal: porcReal(real),
    });

    return {
      ...(await this.sienHeader(companyId, fd)),

      gastos: {
        salariosSueldos: partida(salarios),
        horasExtraordinarias: partida(horasExtra),
        seguridadSocial: partida(seguridadSocial),
        materiasPrimas: partida(materiasPrimas),
        materialesConstruccion: partida(materialesConstruccion),
        suministrosOficina: partida(suministrosOficina),
        serviciosBasicos: partida(serviciosBasicos),
        mantenimientoReparaciones: partida(mantenimiento),
        serviciosProfesionales: partida(serviciosProfesionales),
        depreciacionActivosFijos: partida(depreciacion),
        amortizacionActivosIntangibles: partida(amortizacion),
        gastosRepresentacion: partida(gastosRepresentacion),
        gastosTransporte: partida(gastosTransporte),
        gastosComunicacion: partida(gastosComunicacion),
      },

      totales: {
        planAnual: 0,
        apertura: 0,
        real: totalReal,
      },

      hechoNombre: '',
      aprobadoNombre: '',
      observaciones: '',
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── MODELO SIEN 5922 - BALANCE GENERAL ──
  // ══════════════════════════════════════════════════════════

  async getEfe5922Data(
    companyId: number,
    asOfDate?: string,
    options?: ReportOptions,
  ): Promise<Efe5922Data> {
    const today = new Date().toISOString().split('T')[0];
    const date = asOfDate || today;
    const balance = (codes: string[]) =>
      this.getAccountRangeBalance(companyId, codes, date, options);
    const balanceCredit = (codes: string[]) =>
      this.getAccountRangeBalanceCredit(companyId, codes, date, options);

    // ACTIVOS CORRIENTES
    const efectivo = await balance(['101-119']);
    const cuentasXCobrar = await balance(['135-139', '154', '164-166', '173-180', '334-341']);
    const inventarios = await balance(['183-195']);
    const pagosAnticipados = await balance(['146-149']);
    const totalActivosCorrientes = efectivo + cuentasXCobrar + inventarios + pagosAnticipados;

    // ACTIVOS NO CORRIENTES
    const activosFijos = await balance(['240-251']);
    const depreciacionAcumulada = await balanceCredit(['375-388']);
    const activosIntangibles = await balance(['260-270']);
    const otrosActivos = await balance(['300-312']);
    const totalActivosNoCorrientes = activosFijos - depreciacionAcumulada + activosIntangibles + otrosActivos;

    // PASIVOS CORRIENTES
    const cuentasXPagar = await balanceCredit(['405-415', '565-569']);
    const prestamosCP = await balanceCredit(['420-430']);
    const acumulaciones = await balanceCredit(['455-469', '480-489', '500']);
    const totalPasivosCorrientes = cuentasXPagar + prestamosCP + acumulaciones;

    // PASIVOS NO CORRIENTES
    const prestamosLP = await balanceCredit(['510-540']);
    const provisionesLP = 0;
    const totalPasivosNoCorrientes = prestamosLP + provisionesLP;

    // PATRIMONIO
    const capitalSocial = await balanceCredit(['600-612']);
    const reservas = await balanceCredit(['645-654']);
    const resultadosAcumulados = await balanceCredit(['680-689']);
    const resultadoPeriodo = (totalActivosCorrientes + totalActivosNoCorrientes) - (totalPasivosCorrientes + totalPasivosNoCorrientes + capitalSocial + reservas + resultadosAcumulados);
    const totalPatrimonio = capitalSocial + reservas + resultadosAcumulados + resultadoPeriodo;

    const totalPasivoPatrimonio = totalPasivosCorrientes + totalPasivosNoCorrientes + totalPatrimonio;

    return {
      ...(await this.sienHeader(companyId, date)),

      activosCorrientes: {
        efectivo: { planAnual: 0, apertura: 0, real: efectivo },
        cuentasXCobrar: { planAnual: 0, apertura: 0, real: cuentasXCobrar },
        inventarios: { planAnual: 0, apertura: 0, real: inventarios },
        pagosAnticipados: { planAnual: 0, apertura: 0, real: pagosAnticipados },
        total: { planAnual: 0, apertura: 0, real: totalActivosCorrientes },
      },

      activosNoCorrientes: {
        activosFijos: { planAnual: 0, apertura: 0, real: activosFijos },
        depreciacionAcumulada: { planAnual: 0, apertura: 0, real: depreciacionAcumulada },
        activosIntangibles: { planAnual: 0, apertura: 0, real: activosIntangibles },
        otrosActivos: { planAnual: 0, apertura: 0, real: otrosActivos },
        total: { planAnual: 0, apertura: 0, real: totalActivosNoCorrientes },
      },

      pasivosCorrientes: {
        cuentasXPagar: { planAnual: 0, apertura: 0, real: cuentasXPagar },
        prestamosCP: { planAnual: 0, apertura: 0, real: prestamosCP },
        acumulaciones: { planAnual: 0, apertura: 0, real: acumulaciones },
        total: { planAnual: 0, apertura: 0, real: totalPasivosCorrientes },
      },

      pasivosNoCorrientes: {
        prestamosLP: { planAnual: 0, apertura: 0, real: prestamosLP },
        provisionesLP: { planAnual: 0, apertura: 0, real: provisionesLP },
        total: { planAnual: 0, apertura: 0, real: totalPasivosNoCorrientes },
      },

      patrimonio: {
        capitalSocial: { planAnual: 0, apertura: 0, real: capitalSocial },
        reservas: { planAnual: 0, apertura: 0, real: reservas },
        resultadosAcumulados: { planAnual: 0, apertura: 0, real: resultadosAcumulados },
        resultadoPeriodo: { planAnual: 0, apertura: 0, real: resultadoPeriodo },
        total: { planAnual: 0, apertura: 0, real: totalPatrimonio },
      },

      totalPasivoPatrimonio: { planAnual: 0, apertura: 0, real: totalPasivoPatrimonio },

      hechoNombre: '',
      aprobadoNombre: '',
      observaciones: '',
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── MODELO SIEN 5923 - ESTADO DE RESULTADOS ──
  // ══════════════════════════════════════════════════════════

  async getEfe5923Data(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ): Promise<Efe5923Data> {
    const today = new Date().toISOString().split('T')[0];
    const fd = fromDate || today;
    const td = toDate || today;
    const amount = (codes: string[]) =>
      this.getAccountRangePeriodAmount(companyId, codes, fd, td, options);

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    const incomeTaxRate = Number(company?.incomeTaxRate ?? 35) / 100;

    // INGRESOS (grupo 50.2 - cuentas nominales acreedoras). Los rangos cubren
    // 900-949 sin huecos: antes se usaba 900-913 y 920-949, con lo que las
    // ventas de exportación (914-915) y las subvenciones (916-919) quedaban
    // fuera del informe pese a ser cuentas de ingreso.
    const ventasNetas = await amount(['900-915']);
    // Los ingresos extraordinarios (950-953) se presentan aparte más abajo, por
    // lo que no deben incluirse también aquí.
    const otrosIngresos = await amount(['916-949']);
    const totalIngresos = ventasNetas.credit + otrosIngresos.credit;

    // COSTO DE VENTAS (810-815: costo de ventas de producción/mercancías)
    const costoMercancias = await amount(['814-815']);
    const costoServicios = await amount(['810-813']);
    const totalCostoVentas = costoMercancias.debit + costoServicios.debit;

    const utilidadBruta = totalIngresos - totalCostoVentas;

    // GASTOS OPERATIVOS (50.1 - nominales deudoras)
    const gastosVentas = await amount(['820-824']);
    const gastosAdministrativos = await amount(['826-834']);
    const gastosFinancieros = await amount(['835-839']);
    const totalGastosOperativos = gastosVentas.debit + gastosAdministrativos.debit + gastosFinancieros.debit;

    const utilidadOperativa = utilidadBruta - totalGastosOperativos;

    // OTROS INGRESOS/GASTOS
    const ingresosExtraordinarios = await amount(['950-953']);
    const gastosExtraordinarios = await amount(['845-849']);
    const totalOtros = ingresosExtraordinarios.credit - gastosExtraordinarios.debit;

    const utilidadAntesImpuestos = utilidadOperativa + totalOtros;

    // IMPUESTO RENTA (parametrizable, default 35%)
    const impuestoRenta = utilidadAntesImpuestos > 0 ? utilidadAntesImpuestos * incomeTaxRate : 0;
    const utilidadNeta = utilidadAntesImpuestos - impuestoRenta;

    return {
      ...(await this.sienHeader(companyId, fd)),

      ingresos: {
        ventasNetas: { planAnual: 0, apertura: 0, real: ventasNetas.credit },
        otrosIngresos: { planAnual: 0, apertura: 0, real: otrosIngresos.credit },
        totalIngresos: { planAnual: 0, apertura: 0, real: totalIngresos },
      },

      costoVentas: {
        costoMercanciasVendidas: { planAnual: 0, apertura: 0, real: costoMercancias.debit },
        costoServicios: { planAnual: 0, apertura: 0, real: costoServicios.debit },
        totalCostoVentas: { planAnual: 0, apertura: 0, real: totalCostoVentas },
      },

      utilidadBruta: { planAnual: 0, apertura: 0, real: utilidadBruta },

      gastosOperativos: {
        gastosVentas: { planAnual: 0, apertura: 0, real: gastosVentas.debit },
        gastosAdministrativos: { planAnual: 0, apertura: 0, real: gastosAdministrativos.debit },
        gastosFinancieros: { planAnual: 0, apertura: 0, real: gastosFinancieros.debit },
        totalGastosOperativos: { planAnual: 0, apertura: 0, real: totalGastosOperativos },
      },

      utilidadOperativa: { planAnual: 0, apertura: 0, real: utilidadOperativa },

      otrosIngresosGastos: {
        ingresosExtraordinarios: { planAnual: 0, apertura: 0, real: ingresosExtraordinarios.credit },
        gastosExtraordinarios: { planAnual: 0, apertura: 0, real: gastosExtraordinarios.debit },
        totalOtros: { planAnual: 0, apertura: 0, real: totalOtros },
      },

      utilidadAntesImpuestos: { planAnual: 0, apertura: 0, real: utilidadAntesImpuestos },

      impuestoRenta: { planAnual: 0, apertura: 0, real: impuestoRenta },

      utilidadNeta: { planAnual: 0, apertura: 0, real: utilidadNeta },

      hechoNombre: '',
      aprobadoNombre: '',
      observaciones: '',
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── FLUJO DE EFECTIVO ──
  // ══════════════════════════════════════════════════════════

  async getFlujoEfectivoData(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    options?: ReportOptions,
  ): Promise<FlujoEfectivoData> {
    const today = new Date().toISOString().split('T')[0];
    const fd = fromDate || today;
    const td = toDate || today;
    const amount = (codes: string[]) =>
      this.getAccountRangePeriodAmount(companyId, codes, fd, td, options);

    // ACTIVIDADES OPERATIVAS. Los pagos se miden por el débito de las cuentas
    // por pagar correspondientes, que es la contrapartida de una salida de caja.
    // Los rangos anteriores para personal (505-508) y otros pagos (510-520)
    // apuntaban a pasivos a largo plazo, no a las obligaciones que se liquidan.
    const cobroVentas = await amount(['101-108']);
    const pagoProveedores = await amount(['405-415']);
    const pagoPersonal = await amount(['455-459']);
    const pagoImpuestos = await amount(['440-449']);
    const otrosPagosOperativos = await amount(['480-489']);
    const flujoNetoOperativo = cobroVentas.debit - pagoProveedores.debit - pagoPersonal.debit - pagoImpuestos.debit - otrosPagosOperativos.debit;

    // ACTIVIDADES DE INVERSIÓN
    const compraActivosFijos = await amount(['240-251']);
    const inversionesFinancieras = await amount(['109-119']);
    // El cobro por venta de activos fijos no se puede aislar: el nomenclador no
    // tiene una cuenta propia para él y el importe cae en "Otros Ingresos"
    // (950-952) mezclado con conceptos ajenos. El rango que se usaba antes
    // (731-740) es "Gastos Asociados a la Producción", de modo que el informe
    // presentaba gastos de producción como si fueran cobros por esta venta.
    // Se deja en cero hasta que exista una subcuenta específica.
    const ventaActivosFijos = 0;
    const flujoNetoInversion = ventaActivosFijos - compraActivosFijos.debit - inversionesFinancieras.debit;

    // ACTIVIDADES DE FINANCIAMIENTO. El mismo rango de préstamos aporta las dos
    // caras: el crédito es el importe recibido y el débito el amortizado.
    const prestamos = await amount(['420-430']);
    const pagoDividendos = await amount(['691']);
    const aporteCapital = await amount(['600-612']);
    const flujoNetoFinanciamiento = prestamos.credit - prestamos.debit - pagoDividendos.debit + aporteCapital.credit;

    const variacionEfectivo = flujoNetoOperativo + flujoNetoInversion + flujoNetoFinanciamiento;
    // El efectivo inicial es el saldo al cierre del día anterior al período: si
    // se toma `fd` se incluyen los movimientos del propio día de apertura, que
    // luego se vuelven a contar en la variación.
    const dayBefore = new Date(fd);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const efectivoInicial = await this.getAccountRangeBalance(
      companyId,
      ['101-119'],
      dayBefore.toISOString().split('T')[0],
      options,
    );
    const efectivoFinal = efectivoInicial + variacionEfectivo;

    return {
      ...(await this.sienHeader(companyId, fd)),

      actividadesOperativas: {
        cobroVentas: { planAnual: 0, apertura: 0, real: cobroVentas.debit },
        pagoProveedores: { planAnual: 0, apertura: 0, real: pagoProveedores.debit },
        pagoPersonal: { planAnual: 0, apertura: 0, real: pagoPersonal.debit },
        pagoImpuestos: { planAnual: 0, apertura: 0, real: pagoImpuestos.debit },
        otrosPagosOperativos: { planAnual: 0, apertura: 0, real: otrosPagosOperativos.debit },
        flujoNetoOperativo: { planAnual: 0, apertura: 0, real: flujoNetoOperativo },
      },

      actividadesInversion: {
        compraActivosFijos: { planAnual: 0, apertura: 0, real: compraActivosFijos.debit },
        ventaActivosFijos: { planAnual: 0, apertura: 0, real: ventaActivosFijos },
        inversionesFinancieras: { planAnual: 0, apertura: 0, real: inversionesFinancieras.debit },
        flujoNetoInversion: { planAnual: 0, apertura: 0, real: flujoNetoInversion },
      },

      actividadesFinanciamiento: {
        prestamosRecibidos: { planAnual: 0, apertura: 0, real: prestamos.credit },
        pagoPrestamos: { planAnual: 0, apertura: 0, real: prestamos.debit },
        pagoDividendos: { planAnual: 0, apertura: 0, real: pagoDividendos.debit },
        aporteCapital: { planAnual: 0, apertura: 0, real: aporteCapital.credit },
        flujoNetoFinanciamiento: { planAnual: 0, apertura: 0, real: flujoNetoFinanciamiento },
      },

      variacionEfectivo: { planAnual: 0, apertura: 0, real: variacionEfectivo },
      efectivoInicial: { planAnual: 0, apertura: 0, real: efectivoInicial },
      efectivoFinal: { planAnual: 0, apertura: 0, real: efectivoFinal },

      hechoNombre: '',
      aprobadoNombre: '',
      observaciones: '',
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── EXPORTACIÓN POR EJERCICIO FISCAL ──
  // ══════════════════════════════════════════════════════════

  async exportGeneralJournalByFiscalYear(companyId: number, fiscalYearId: string) {
    const fy = await this.fiscalYearRepo.findOne({ where: { id: fiscalYearId, companyId } });
    if (!fy) throw new NotFoundException(`Año fiscal #${fiscalYearId} no encontrado`);

    const vouchers = await this.voucherRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.lines', 'lines')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('v.date >= :startDate', { startDate: fy.startDate })
      .andWhere('v.date <= :endDate', { endDate: fy.endDate })
      .orderBy('v.date', 'ASC')
      .addOrderBy('v.voucherNumber', 'ASC')
      .getMany();

    let totalDebit = 0;
    let totalCredit = 0;
    for (const v of vouchers) {
      for (const l of v.lines) {
        totalDebit += Number(l.debit);
        totalCredit += Number(l.credit);
      }
    }

    return {
      vouchers,
      fiscalYear: { name: fy.name, startDate: fy.startDate, endDate: fy.endDate },
      totalVouchers: vouchers.length,
      totalDebit,
      totalCredit,
    };
  }

  async exportGeneralLedgerByFiscalYear(companyId: number, fiscalYearId: string) {
    const fy = await this.fiscalYearRepo.findOne({ where: { id: fiscalYearId, companyId } });
    if (!fy) throw new NotFoundException(`Año fiscal #${fiscalYearId} no encontrado`);

    const accounts = await this.accountRepo.find({
      where: { companyId, isActive: true },
      order: { code: 'ASC' },
    });

    const result: Array<{
      code: string;
      name: string;
      nature: string;
      openingBalance: number;
      movements: Array<{ date: string; voucherNumber: string; description: string; debit: number; credit: number; balance: number }>;
      closingBalance: number;
    }> = [];

    for (const account of accounts) {
      // Saldo inicial: movimientos posted antes del inicio del ejercicio
      const openingRaw = await this.voucherLineRepo
        .createQueryBuilder('vl')
        .select('COALESCE(SUM(vl.debit), 0)', 'debit')
        .addSelect('COALESCE(SUM(vl.credit), 0)', 'credit')
        .innerJoin('vl.voucher', 'v')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.status = :status', { status: 'posted' })
        .andWhere('v.date < :startDate', { startDate: fy.startDate })
        .andWhere('vl.account_code = :code', { code: account.code })
        .getRawOne();

      const openingDebit = Number(openingRaw?.debit || 0);
      const openingCredit = Number(openingRaw?.credit || 0);
      const openingBalance = account.nature === 'deudora'
        ? openingDebit - openingCredit
        : openingCredit - openingDebit;

      // Movimientos del período
      const lines = await this.voucherLineRepo
        .createQueryBuilder('vl')
        .select(['vl.debit', 'vl.credit', 'vl.description'])
        .addSelect('v.date', 'date')
        .addSelect('v.voucherNumber', 'voucherNumber')
        .addSelect('v.description', 'vDescription')
        .innerJoin('vl.voucher', 'v')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.status = :status', { status: 'posted' })
        .andWhere('v.date >= :startDate', { startDate: fy.startDate })
        .andWhere('v.date <= :endDate', { endDate: fy.endDate })
        .andWhere('vl.account_code = :code', { code: account.code })
        .orderBy('v.date', 'ASC')
        .addOrderBy('v.voucherNumber', 'ASC')
        .getRawMany();

      if (lines.length === 0 && openingBalance === 0) continue;

      let running = openingBalance;
      const movements = lines.map((l: any) => {
        const d = Number(l.vl_debit || 0);
        const c = Number(l.vl_credit || 0);
        running += account.nature === 'deudora' ? d - c : c - d;
        return {
          date: l.date,
          voucherNumber: l.voucherNumber,
          description: l.vl_description || l.vDescription || '',
          debit: d,
          credit: c,
          balance: running,
        };
      });

      result.push({
        code: account.code,
        name: account.name,
        nature: account.nature,
        openingBalance,
        movements,
        closingBalance: running,
      });
    }

    return {
      accounts: result,
      fiscalYear: { name: fy.name, startDate: fy.startDate, endDate: fy.endDate },
    };
  }
}
