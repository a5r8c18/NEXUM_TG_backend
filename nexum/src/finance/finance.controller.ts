import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ── Dashboard ──
  @Get('dashboard')
  getDashboard(@Req() req: Request) {
    return this.financeService.getFinanceDashboard(getCompanyId(req));
  }

  // ── Cuentas por Cobrar ──
  @Get('receivables')
  findAllReceivables(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('customerName') customerName?: string,
    @Query('agingCategory') agingCategory?: string,
  ) {
    return this.financeService.findAllReceivables(getCompanyId(req), { status, customerName, agingCategory });
  }

  @Get('receivables/statistics')
  getReceivableStats(@Req() req: Request) {
    return this.financeService.getReceivableStatistics(getCompanyId(req));
  }

  @Get('receivables/:id')
  findOneReceivable(@Req() req: Request, @Param('id') id: string) {
    return this.financeService.findOneReceivable(getCompanyId(req), id);
  }

  @Post('receivables')
  createReceivable(@Req() req: Request, @Body() body: any) {
    return this.financeService.createReceivable(getCompanyId(req), body);
  }

  // ── Cuentas por Pagar ──
  @Get('payables')
  findAllPayables(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('supplierName') supplierName?: string,
  ) {
    return this.financeService.findAllPayables(getCompanyId(req), { status, supplierName });
  }

  @Get('payables/statistics')
  getPayableStats(@Req() req: Request) {
    return this.financeService.getPayableStatistics(getCompanyId(req));
  }

  @Get('payables/:id')
  findOnePayable(@Req() req: Request, @Param('id') id: string) {
    return this.financeService.findOnePayable(getCompanyId(req), id);
  }

  @Post('payables')
  createPayable(@Req() req: Request, @Body() body: any) {
    return this.financeService.createPayable(getCompanyId(req), body);
  }

  // ── Cuentas Bancarias ──
  @Get('banks')
  findAllBanks(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('accountType') accountType?: string,
  ) {
    return this.financeService.findAllBankAccounts(getCompanyId(req), { status, accountType });
  }

  @Get('banks/statistics')
  getBankStats(@Req() req: Request) {
    return this.financeService.getBankStatistics(getCompanyId(req));
  }

  @Get('banks/:id')
  findOneBank(@Req() req: Request, @Param('id') id: string) {
    return this.financeService.findOneBankAccount(getCompanyId(req), id);
  }

  @Post('banks')
  createBank(@Req() req: Request, @Body() body: any) {
    return this.financeService.createBankAccount(getCompanyId(req), body);
  }

  @Put('banks/:id')
  updateBank(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.financeService.updateBankAccount(getCompanyId(req), id, body);
  }

  // ── Transacciones Bancarias ──
  @Get('banks/:bankAccountId/transactions')
  findBankTransactions(
    @Req() req: Request,
    @Param('bankAccountId') bankAccountId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('type') type?: string,
  ) {
    return this.financeService.findBankTransactions(getCompanyId(req), bankAccountId, { fromDate, toDate, type });
  }

  @Post('banks/:bankAccountId/transactions')
  createBankTransaction(@Req() req: Request, @Param('bankAccountId') bankAccountId: string, @Body() body: any) {
    return this.financeService.createBankTransaction(getCompanyId(req), { ...body, bankAccountId });
  }

  // ── Pagos (Cobros y Pagos) ──
  @Get('payments')
  findAllPayments(
    @Req() req: Request,
    @Query('paymentType') paymentType?: string,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.financeService.findAllPayments(getCompanyId(req), { paymentType, status, fromDate, toDate });
  }

  @Get('payments/statistics')
  getPaymentStats(@Req() req: Request) {
    return this.financeService.getPaymentStatistics(getCompanyId(req));
  }

  @Get('payments/:id')
  findOnePayment(@Req() req: Request, @Param('id') id: string) {
    return this.financeService.findOnePayment(getCompanyId(req), id);
  }

  @Post('payments')
  createPayment(@Req() req: Request, @Body() body: any) {
    return this.financeService.createPayment(getCompanyId(req), body);
  }

  // ── Caja (Efectivo - Cuenta 101) ──
  @Get('cash-registers')
  findAllCashRegisters(@Req() req: Request) {
    return this.financeService.findAllCashRegisters(getCompanyId(req));
  }

  @Get('cash-registers/statistics')
  getCashStats(@Req() req: Request) {
    return this.financeService.getCashStatistics(getCompanyId(req));
  }

  @Get('cash-registers/:id')
  findOneCashRegister(@Req() req: Request, @Param('id') id: string) {
    return this.financeService.findOneCashRegister(getCompanyId(req), id);
  }

  @Post('cash-registers')
  createCashRegister(@Req() req: Request, @Body() body: any) {
    return this.financeService.createCashRegister(getCompanyId(req), body);
  }

  @Put('cash-registers/:id')
  updateCashRegister(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.financeService.updateCashRegister(getCompanyId(req), id, body);
  }

  @Post('cash-registers/:id/open')
  openCashRegister(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.financeService.openCashRegister(getCompanyId(req), id, body?.openingBalance);
  }

  @Post('cash-registers/:id/close')
  closeCashRegister(@Req() req: Request, @Param('id') id: string) {
    return this.financeService.closeCashRegister(getCompanyId(req), id);
  }

  @Post('cash-registers/:id/audit')
  performCashAudit(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.financeService.performCashAudit(getCompanyId(req), id, body.physicalBalance);
  }

  @Post('cash-registers/:id/deposit-to-bank')
  depositToBank(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.financeService.depositToBank(
      getCompanyId(req), id, body.bankAccountId, body.amount, body.description,
    );
  }

  @Get('cash-registers/:cashRegisterId/movements')
  findCashMovements(
    @Req() req: Request,
    @Param('cashRegisterId') cashRegisterId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('movementType') movementType?: string,
  ) {
    return this.financeService.findCashMovements(getCompanyId(req), cashRegisterId, { fromDate, toDate, movementType });
  }

  // ── Conciliación Bancaria ──

  @Get('reconciliations')
  getReconciliations(@Req() req: Request, @Query('bankAccountId') bankAccountId?: string) {
    return this.financeService.getReconciliations(getCompanyId(req), bankAccountId);
  }

  @Get('reconciliations/:id')
  getReconciliation(@Req() req: Request, @Param('id') id: string) {
    return this.financeService.getReconciliation(getCompanyId(req), id);
  }

  @Post('reconciliations')
  createReconciliation(
    @Req() req: Request,
    @Body() body: CreateReconciliationDto,
  ) {
    return this.financeService.createReconciliation(getCompanyId(req), body);
  }

  @Patch('reconciliations/:id/complete')
  completeReconciliation(@Req() req: Request, @Param('id') id: string) {
    return this.financeService.completeReconciliation(getCompanyId(req), id);
  }
}
