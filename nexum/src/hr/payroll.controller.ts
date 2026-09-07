/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PayrollService } from './payroll.service';
import { PayrollConceptService } from './payroll-concept.service';
import { PayrollReportService } from './payroll-report.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly payrollConceptService: PayrollConceptService,
    private readonly payrollReportService: PayrollReportService,
    ) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('period') period?: string,
    @Query('status') status?: string,
    @Query('concept') concept?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.findAll(companyId, {
      period,
      status,
      concept,
      startDate,
      endDate,
    });
  }

  @Get('statistics')
  getStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.payrollService.getStatistics(companyId);
  }

  @Get(':id/export/pdf')
  async exportPdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const companyId = getCompanyId(req);
    const buffer = await this.payrollReportService.generateNominaPdf(
      companyId,
      parseInt(id),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="nomina-sc-4-06-${id}.pdf"`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.payrollService.findOne(companyId, parseInt(id));
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.payrollService.create(companyId, body);
  }

  @Post('generate')
  generate(
    @Req() req: Request,
    @Body()
    body: {
      period: string;
      startDate: string;
      endDate: string;
      processedBy?: string;
    },
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.generateFromEmployees(companyId, body);
  }

  @Post('generate/vacaciones')
  generateVacations(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateVacations(companyId, body);
  }

  @Post('generate/subsidio')
  generateSubsidy(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateSubsidy(companyId, body);
  }

  @Post('generate/maternidad')
  generateMaternity(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateMaternity(companyId, body);
  }

  @Post('generate/libre')
  generateFree(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateFree(companyId, body);
  }

  @Put(':id/items')
  updateItems(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { items: any[] },
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.updateItems(companyId, parseInt(id), body.items);
  }

  @Put(':id/process')
  process(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { processedBy: string; costCenterId?: string },
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.process(
      companyId,
      parseInt(id),
      body.processedBy,
      body.costCenterId,
    );
  }

  @Put(':id/pay')
  markAsPaid(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { bankAccountId?: string },
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.markAsPaid(companyId, parseInt(id), body?.bankAccountId);
  }

  @Put(':id/cancel')
  cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.cancel(companyId, parseInt(id), body?.reason);
  }
}
