/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
import { VoucherService } from './voucher.service';
import { ReportService } from './report.service';
import { AccountService } from './account.service';
import { CostCenterService } from './cost-center.service';
import { FiscalYearService } from './fiscal-year.service';
import { ElementoService } from './elemento.service';
import { ExpenseTypeService } from './expense-type.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';
import {
  CreateVoucherDto,
  UpdateVoucherDto,
  UpdateVoucherStatusDto,
  CreateAccountDto,
  UpdateAccountDto,
  CreateSubaccountDto,
  CreateCostCenterDto,
  UpdateCostCenterDto,
  CreateFiscalYearDto,
  CreateElementoDto,
  UpdateElementoDto,
} from './dto';
import { PaginationService } from '../common/pagination/pagination.service';
import { SearchPaginationDto } from '../common/pagination/pagination.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly voucherService: VoucherService,
    private readonly reportService: ReportService,
    private readonly accountService: AccountService,
    private readonly costCenterService: CostCenterService,
    private readonly fiscalYearService: FiscalYearService,
    private readonly elementoService: ElementoService,
    private readonly expenseTypeService: ExpenseTypeService,
    private readonly paginationService: PaginationService,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── VOUCHERS (Comprobantes) ──
  // ══════════════════════════════════════════════════════════

  @Get('vouchers')
  findAllVouchers(
    @Req() req: Request,
    @Query() paginationDto: SearchPaginationDto,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('sourceModule') sourceModule?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.voucherService.findAllVouchersPaginated(companyId, {
      ...paginationDto,
      status,
      type,
      fromDate,
      toDate,
      sourceModule,
      calculatedOffset: 0,
      calculatedLimit: 0
    });
  }

  @Get('vouchers/statistics')
  getVoucherStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.voucherService.getVoucherStatistics(companyId);
  }

  @Get('vouchers/:id')
  findOneVoucher(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.voucherService.findOneVoucher(companyId, id);
  }

  @Post('vouchers')
  createVoucher(@Req() req: Request, @Body() body: CreateVoucherDto) {
    const companyId = getCompanyId(req);
    return this.voucherService.createVoucher(companyId, body);
  }

  @Put('vouchers/:id')
  updateVoucher(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateVoucherDto,
  ) {
    const companyId = getCompanyId(req);
    return this.voucherService.updateVoucher(companyId, id, body);
  }

  @Put('vouchers/:id/status')
  updateVoucherStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateVoucherStatusDto,
  ) {
    const companyId = getCompanyId(req);
    return this.voucherService.updateVoucherStatus(companyId, id, body.status);
  }

  @Delete('vouchers/:id')
  deleteVoucher(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.voucherService.deleteVoucher(companyId, id);
  }

  // ══════════════════════════════════════════════════════════
  // ── VOUCHER LINES (Partidas) ──
  // ══════════════════════════════════════════════════════════

  @Get('vouchers/lines')
  findAllVoucherLines(
    @Req() req: Request,
    @Query('voucherId') voucherId?: string,
    @Query('accountId') accountId?: string,
    @Query('costCenterId') costCenterId?: string,
    @Query('element') element?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.voucherService.findAllVouchers(companyId, {
      status: undefined,
      type: undefined,
      fromDate,
      toDate,
      sourceModule: undefined,
      search,
    });
  }

  @Get('voucher-lines/statistics')
  getVoucherLineStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.voucherService.getVoucherStatistics(companyId);
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
    return this.costCenterService.findAllCostCenters(companyId, {
      type,
      search,
      activeOnly: activeOnly === 'true',
    });
  }

  @Get('cost-centers/statistics')
  getCostCenterStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.costCenterService.getCostCenterStatistics(companyId);
  }

  @Get('cost-centers/:id')
  findOneCostCenter(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.costCenterService.findOneCostCenter(companyId, id);
  }

  @Post('cost-centers')
  createCostCenter(@Req() req: Request, @Body() body: CreateCostCenterDto) {
    const companyId = getCompanyId(req);
    return this.costCenterService.createCostCenter(companyId, body);
  }

  @Put('cost-centers/:id')
  updateCostCenter(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateCostCenterDto,
  ) {
    const companyId = getCompanyId(req);
    return this.costCenterService.updateCostCenter(companyId, id, body);
  }

  @Delete('cost-centers/:id')
  deleteCostCenter(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.costCenterService.deleteCostCenter(companyId, id);
  }

  // ══════════════════════════════════════════════════════════
  // ── FISCAL YEARS (Años Fiscales) ──
  // ══════════════════════════════════════════════════════════

  @Get('fiscal-years')
  findAllFiscalYears(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.fiscalYearService.findAllFiscalYears(companyId);
  }

  @Get('fiscal-years/:id')
  findOneFiscalYear(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.fiscalYearService.findOneFiscalYear(companyId, id);
  }

  @Post('fiscal-years')
  createFiscalYear(@Req() req: Request, @Body() body: CreateFiscalYearDto) {
    const companyId = getCompanyId(req);
    return this.fiscalYearService.createFiscalYear(companyId, body);
  }

  @Patch('fiscal-years/:id/close')
  closeFiscalYear(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.fiscalYearService.closeFiscalYear(companyId, id);
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
    return this.fiscalYearService.findAllPeriods(companyId, fiscalYearId);
  }

  @Patch('periods/:id/close')
  closePeriod(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    const user = (req as any).user;
    return this.fiscalYearService.closePeriod(
      companyId,
      id,
      user?.email || 'admin',
    );
  }

  @Patch('periods/:id/reopen')
  reopenPeriod(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.fiscalYearService.reopenPeriod(companyId, id);
  }

  // ══════════════════════════════════════════════════════════
  // ── Elements (Agrupación por Tipo de Cuenta) ──
  // ══════════════════════════════════════════════════════════

  @Get('elements')
  getAccountElements(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountService.getAccountElements(companyId);
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
    return this.reportService.getTrialBalance(companyId, fromDate, toDate);
  }

  @Get('reports/balance-sheet')
  getBalanceSheet(@Req() req: Request, @Query('asOfDate') asOfDate?: string) {
    const companyId = getCompanyId(req);
    return this.reportService.getBalanceSheet(companyId, asOfDate);
  }

  @Get('reports/income-statement')
  getIncomeStatement(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.getIncomeStatement(companyId, fromDate, toDate);
  }

  @Get('reports/expense-breakdown')
  getExpenseBreakdown(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.getExpenseBreakdown(companyId, fromDate, toDate);
  }

  @Get('reports/general-ledger')
  getGeneralLedger(
    @Req() req: Request,
    @Query('accountCode') accountCode: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.getGeneralLedger(
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
    return this.reportService.getGeneralJournal(companyId, fromDate, toDate);
  }

  @Get('reports/cost-center-analysis')
  getCostCenterAnalysis(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.getCostCenterAnalysis(
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
    return this.reportService.exportTrialBalanceExcel(
      companyId,
      fromDate,
      toDate,
      res,
    );
  }

  @Get('reports/trial-balance/export/pdf')
  exportTrialBalancePDF(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.exportTrialBalancePDF(
      companyId,
      fromDate,
      toDate,
      res,
    );
  }

  @Get('reports/balance-sheet/export/excel')
  exportBalanceSheetExcel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.exportBalanceSheetExcel(companyId, asOfDate, res);
  }

  @Get('reports/balance-sheet/export/pdf')
  exportBalanceSheetPDF(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.exportBalanceSheetPDF(companyId, asOfDate, res);
  }

  @Get('reports/income-statement/export/excel')
  exportIncomeStatementExcel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.exportIncomeStatementExcel(
      companyId,
      fromDate,
      toDate,
      res,
    );
  }

  @Get('reports/income-statement/export/pdf')
  exportIncomeStatementPDF(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.exportIncomeStatementPDF(
      companyId,
      fromDate,
      toDate,
      res,
    );
  }

  // ── Modelos SIEN (5920 / 5921) ──

  @Get('reports/modelo-5920/export/excel')
  exportModelo5920Excel(
    @Req() req: Request,
    @Res() res: Response,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.exportModelo5920Excel(companyId, asOfDate, res);
  }

  @Get('reports/modelo-5921/export/excel')
  exportModelo5921Excel(
    @Req() req: Request,
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.exportModelo5921Excel(
      companyId,
      fromDate,
      toDate,
      res,
    );
  }

  @Get('reports/modelo-5924/export/excel')
  exportModelo5924Excel(
    @Req() req: Request,
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportService.exportModelo5924Excel(
      companyId,
      fromDate,
      toDate,
      res,
    );
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
    return this.reportService.findAllEntries(companyId, {
      status,
      fromDate,
      toDate,
      accountCode,
    });
  }

  // ── Accounts (Chart of Accounts) ──

  @Get('accounts/statistics')
  getAccountStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountService.getAccountStatistics(companyId);
  }

  @Get('kpis')
  getFinancialKPIs(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.reportService.getFinancialKPIs(companyId);
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
    return this.accountService.findAllAccounts(companyId, {
      type,
      search,
      nature,
      level,
      groupNumber,
      activeOnly: activeOnly === 'true',
      allowsMovements: allowsMovements === 'true',
    });
  }

  @Get('accounts/:parentCode/subaccounts')
  findAccountsByParentCode(
    @Req() req: Request,
    @Param('parentCode') parentCode: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountService.findAccountsByParentCode(companyId, parentCode);
  }

  @Get('subaccounts/:accountId')
  getSubaccountsByAccount(
    @Req() req: Request,
    @Param('accountId') accountId: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountService.getSubaccountsByAccount(companyId, accountId);
  }

  @Get('subaccounts')
  findAllSubaccounts(
    @Req() req: Request,
    @Query('accountId') accountId?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountService.findAllAccounts(companyId, { level: '4' });
  }

  @Get('subaccounts/statistics')
  getSubaccountStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.accountService.getStatistics(companyId);
  }

  @Get('subaccounts/:id')
  findOneSubaccount(@Param('id') id: string) {
    return this.accountService.findOne(id);
  }

  @Post('subaccounts')
  createSubaccount(@Req() req: Request, @Body() body: CreateSubaccountDto) {
    const companyId = getCompanyId(req);
    return this.accountService.createSubaccount(companyId, body);
  }

  @Put('subaccounts/:id')
  updateSubaccount(@Param('id') id: string, @Body() body: UpdateAccountDto) {
    return this.accountService.update(id, body);
  }

  @Patch('subaccounts/:id/toggle-active')
  toggleSubaccountActive(@Param('id') id: string) {
    return this.accountService.toggleActive(id);
  }

  @Delete('subaccounts/:id')
  deleteSubaccount(@Param('id') id: string) {
    return this.accountService.delete(id);
  }

  @Get('accounts/children/:parentCode')
  getChildAccounts(
    @Req() req: Request,
    @Param('parentCode') parentCode: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountService.findAccountsByParentCode(companyId, parentCode);
  }

  @Post('accounts')
  createAccount(@Req() req: Request, @Body() body: CreateAccountDto) {
    const companyId = getCompanyId(req);
    return this.accountService.createAccount(companyId, body);
  }

  @Put('accounts/:id')
  updateAccount(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateAccountDto,
  ) {
    const companyId = getCompanyId(req);
    return this.accountService.updateAccount(companyId, id, body);
  }

  @Delete('accounts/:id')
  deleteAccount(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountService.deleteAccount(companyId, id);
  }

  // ================================

  // ================================

  // ================================
  // Elements (Elements de Gastos)
  // ================================

  @Get('elements')
  findAllElements(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.elementoService.findAll(companyId, {
      status,
      search,
    });
  }

  @Get('Elements/:id')
  findOneElement(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.elementoService.findOne(companyId, id);
  }

  @Get('Elements/statistics')
  getElementStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.elementoService.getStatistics(companyId);
  }

  @Post('Elements')
  createElement(@Req() req: Request, @Body() body: CreateElementoDto) {
    const companyId = getCompanyId(req);
    return this.elementoService.create(companyId, body);
  }

  @Put('Elements/:id')
  updateElement(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateElementoDto,
  ) {
    const companyId = getCompanyId(req);
    return this.elementoService.update(companyId, id, body);
  }

  @Patch('Elements/:id/status')
  updateElementStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: 'posted' | 'cancelled' },
  ) {
    const companyId = getCompanyId(req);
    return this.elementoService.updateStatus(companyId, id, body.status);
  }

  @Delete('Elements/:id')
  deleteElement(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.elementoService.delete(companyId, id);
  }

  // ================================
  // EXPENSE TYPES (Tipos de Partidas)
  // ================================

  @Get('expense-types')
  findAllExpenseTypes(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.expenseTypeService.findAll(companyId);
  }

  @Post('expense-types/seed')
  seedExpenseTypes(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.expenseTypeService.seed(companyId);
  }

  @Post('expense-types')
  createExpenseType(@Req() req: Request, @Body() body: CreateElementoDto) {
    const companyId = getCompanyId(req);
    return this.expenseTypeService.create(companyId, body);
  }
}
