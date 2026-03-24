import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ReportsService } from './reports.service';

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
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
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
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
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
