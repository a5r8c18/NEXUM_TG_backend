import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
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

  // ── Journal Entries ──

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
    return this.accountingService.updateEntryStatus(companyId, id, body.status);
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

  @Get('accounts')
  findAllAccounts(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('nature') nature?: string,
    @Query('level') level?: string,
    @Query('groupNumber') groupNumber?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.accountingService.findAllAccounts(companyId, { type, search, nature, level, groupNumber, activeOnly });
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
  deleteAccount(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.accountingService.deleteAccount(companyId, id);
  }
}
