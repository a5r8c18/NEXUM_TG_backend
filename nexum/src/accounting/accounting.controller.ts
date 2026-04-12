import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // ══════════════════════════════════════════════════════════
  // ── VOUCHERS (Comprobantes) ──
  // ══════════════════════════════════════════════════════════

  @Get('vouchers')
  findAllVouchers(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('sourceModule') sourceModule?: string,
    @Query('search') search?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllVouchers(companyId, {
      status,
      type,
      fromDate,
      toDate,
      sourceModule,
      search,
    });
  }

  @Get('vouchers/statistics')
  getVoucherStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.getVoucherStatistics(companyId);
  }

  @Get('vouchers/:id')
  findOneVoucher(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.findOneVoucher(companyId, id);
  }

  @Post('vouchers')
  createVoucher(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.accountingService.createVoucher(companyId, body);
  }

  @Put('vouchers/:id/status')
  updateVoucherStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.updateVoucherStatus(
      companyId,
      id,
      body.status,
    );
  }

  @Delete('vouchers/:id')
  deleteVoucher(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.deleteVoucher(companyId, id);
  }

  // ══════════════════════════════════════════════════════════
  // ── VOUCHER LINES (Partidas) ──
  // ══════════════════════════════════════════════════════════

  @Get('voucher-lines')
  findAllVoucherLines(
    @Req() req: Request,
    @Query('accountCode') accountCode?: string,
    @Query('costCenterId') costCenterId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('voucherId') voucherId?: string,
    @Query('search') search?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllVoucherLines(companyId, {
      accountCode,
      costCenterId,
      fromDate,
      toDate,
      voucherId,
      search,
    });
  }

  @Get('voucher-lines/statistics')
  getVoucherLineStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.getVoucherLineStatistics(companyId);
  }

  // ══════════════════════════════════════════════════════════
  // ── COST CENTERS (Centros de Costo) ──
  // ══════════════════════════════════════════════════════════

  @Get('cost-centers')
  findAllCostCenters(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllCostCenters(companyId, {
      type,
      search,
      activeOnly,
    });
  }

  @Get('cost-centers/statistics')
  getCostCenterStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.getCostCenterStatistics(companyId);
  }

  @Get('cost-centers/:id')
  findOneCostCenter(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.findOneCostCenter(companyId, id);
  }

  @Post('cost-centers')
  createCostCenter(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.accountingService.createCostCenter(companyId, body);
  }

  @Put('cost-centers/:id')
  updateCostCenter(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.updateCostCenter(companyId, id, body);
  }

  @Delete('cost-centers/:id')
  deleteCostCenter(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.deleteCostCenter(companyId, id);
  }

  // ══════════════════════════════════════════════════════════
  // ── FISCAL YEARS (Años Fiscales) ──
  // ══════════════════════════════════════════════════════════

  @Get('fiscal-years')
  findAllFiscalYears(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllFiscalYears(companyId);
  }

  @Get('fiscal-years/:id')
  findOneFiscalYear(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.findOneFiscalYear(companyId, id);
  }

  @Post('fiscal-years')
  createFiscalYear(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.accountingService.createFiscalYear(companyId, body);
  }

  @Patch('fiscal-years/:id/close')
  closeFiscalYear(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.closeFiscalYear(companyId, id);
  }

  // ══════════════════════════════════════════════════════════
  // ── ACCOUNTING PERIODS (Períodos Contables) ──
  // ══════════════════════════════════════════════════════════

  @Get('periods')
  findAllPeriods(
    @Req() req: Request,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllPeriods(companyId, fiscalYearId);
  }

  @Patch('periods/:id/close')
  closePeriod(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    const user = (req as any).user;
    return this.accountingService.closePeriod(
      companyId,
      id,
      user?.email || 'admin',
    );
  }

  @Patch('periods/:id/reopen')
  reopenPeriod(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.reopenPeriod(companyId, id);
  }

  // ══════════════════════════════════════════════════════════
  // ── ELEMENTOS (Agrupación por Tipo de Cuenta) ──
  // ══════════════════════════════════════════════════════════

  @Get('elements')
  getAccountElements(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.getAccountElements(companyId);
  }

  // ══════════════════════════════════════════════════════════
  // ── REPORTS (Informes Contables) ──
  // ══════════════════════════════════════════════════════════

  @Get('reports/trial-balance')
  getTrialBalance(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.getTrialBalance(companyId, fromDate, toDate);
  }

  @Get('reports/balance-sheet')
  getBalanceSheet(
    @Req() req: Request,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.getBalanceSheet(companyId, asOfDate);
  }

  @Get('reports/income-statement')
  getIncomeStatement(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.getIncomeStatement(
      companyId,
      fromDate,
      toDate,
    );
  }

  @Get('reports/general-ledger')
  getGeneralLedger(
    @Req() req: Request,
    @Query('accountCode') accountCode: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.getGeneralLedger(
      companyId,
      accountCode,
      fromDate,
      toDate,
    );
  }

  @Get('reports/general-journal')
  getGeneralJournal(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.getGeneralJournal(
      companyId,
      fromDate,
      toDate,
    );
  }

  @Get('reports/cost-center-analysis')
  getCostCenterAnalysis(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.getCostCenterAnalysis(
      companyId,
      fromDate,
      toDate,
    );
  }

  // Export endpoints
  @Get('reports/trial-balance/export/excel')
  exportTrialBalanceExcel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.exportTrialBalanceExcel(companyId, fromDate, toDate, res);
  }

  @Get('reports/trial-balance/export/pdf')
  exportTrialBalancePDF(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.exportTrialBalancePDF(companyId, fromDate, toDate, res);
  }

  @Get('reports/balance-sheet/export/excel')
  exportBalanceSheetExcel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.exportBalanceSheetExcel(companyId, asOfDate, res);
  }

  @Get('reports/balance-sheet/export/pdf')
  exportBalanceSheetPDF(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.exportBalanceSheetPDF(companyId, asOfDate, res);
  }

  @Get('reports/income-statement/export/excel')
  exportIncomeStatementExcel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.exportIncomeStatementExcel(companyId, fromDate, toDate, res);
  }

  @Get('reports/income-statement/export/pdf')
  exportIncomeStatementPDF(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.exportIncomeStatementPDF(companyId, fromDate, toDate, res);
  }

  // ══════════════════════════════════════════════════════════
  // ── LEGACY: Journal Entries (backward compatibility) ──
  // ══════════════════════════════════════════════════════════

  @Get('entries')
  findAllEntries(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('accountCode') accountCode?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllEntries(companyId, {
      status,
      fromDate,
      toDate,
      accountCode,
    });
  }

  @Get('entries/statistics')
  getEntryStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.getEntryStatistics(companyId);
  }

  @Get('entries/:id')
  findOneEntry(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.findOneEntry(companyId, id);
  }

  @Post('entries')
  createEntry(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.accountingService.createEntry(companyId, body);
  }

  @Put('entries/:id/status')
  updateEntryStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.updateEntryStatus(
      companyId,
      id,
      body.status,
    );
  }

  @Delete('entries/:id')
  deleteEntry(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.deleteEntry(companyId, id);
  }

  // ── Accounts (Chart of Accounts) ──

  @Get('accounts/statistics')
  getAccountStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.getAccountStatistics(companyId);
  }

  @Get('kpis')
  getFinancialKPIs(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.getFinancialKPIs(companyId);
  }

  @Get('accounts')
  findAllAccounts(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('nature') nature?: string,
    @Query('level') level?: string,
    @Query('groupNumber') groupNumber?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('allowsMovements') allowsMovements?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllAccounts(companyId, {
      type,
      search,
      nature,
      level,
      groupNumber,
      activeOnly,
      allowsMovements,
    });
  }

  @Get('accounts/:parentCode/subaccounts')
  findAccountsByParentCode(@Req() req: Request, @Param('parentCode') parentCode: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAccountsByParentCode(companyId, parentCode);
  }

  @Post('accounts')
  createAccount(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.accountingService.createAccount(companyId, body);
  }

  @Put('accounts/:id')
  updateAccount(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.updateAccount(companyId, id, body);
  }

  @Delete('accounts/:id')
  deleteAccount(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.deleteAccount(companyId, id);
  }

  // ================================
  // JOURNAL ENTRIES (Partidas Independientes)
  // ================================

  @Get('journal-entries')
  findAllJournalEntries(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('accountCode') accountCode?: string,
    @Query('search') search?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllJournalEntries(companyId, {
      status,
      type,
      fromDate,
      toDate,
      accountCode,
      search,
    });
  }

  @Get('journal-entries/:id')
  findOneJournalEntry(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.findOneJournalEntry(companyId, id);
  }

  @Get('journal-entries/statistics')
  getJournalEntryStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.getJournalEntryStatistics(companyId);
  }

  @Post('journal-entries')
  createJournalEntry(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.accountingService.createJournalEntry(companyId, body);
  }

  @Put('journal-entries/:id')
  updateJournalEntry(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.updateJournalEntry(companyId, id, body);
  }

  @Patch('journal-entries/:id/status')
  updateJournalEntryStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: 'posted' | 'cancelled' },
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.updateJournalEntryStatus(companyId, id, body.status);
  }

  @Delete('journal-entries/:id')
  deleteJournalEntry(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.deleteJournalEntry(companyId, id);
  }

  // ================================
  // EXPENSE TYPES (Tipos de Partidas)
  // ================================

  @Get('expense-types')
  findAllExpenseTypes(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllExpenseTypes(companyId);
  }

  @Post('expense-types/seed')
  seedExpenseTypes(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountingService.seedExpenseTypes(companyId);
  }

  @Post('expense-types')
  createExpenseType(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.accountingService.createExpenseType(companyId, body);
  }
}
