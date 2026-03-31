import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('reception')
  getReceptionReports(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('product') product?: string,
    @Query('entity') entity?: string,
    @Query('warehouse') warehouse?: string,
    @Query('document') document?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportsService.getReceptionReports(companyId, {
      fromDate,
      toDate,
      product,
      entity,
      warehouse,
      document,
    });
  }

  @Get('delivery')
  getDeliveryReports(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('product') product?: string,
    @Query('entity') entity?: string,
    @Query('warehouse') warehouse?: string,
    @Query('document') document?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.reportsService.getDeliveryReports(companyId, {
      fromDate,
      toDate,
      product,
      entity,
      warehouse,
      document,
    });
  }
}
