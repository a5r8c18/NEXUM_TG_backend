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
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('period') period?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.findAll(companyId, {
      period,
      status,
      startDate,
      endDate,
    });
  }

  @Get('statistics')
  getStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.payrollService.getStatistics(companyId);
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

  @Put(':id/process')
  process(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { processedBy: string },
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.process(
      companyId,
      parseInt(id),
      body.processedBy,
    );
  }

  @Put(':id/pay')
  markAsPaid(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.payrollService.markAsPaid(companyId, parseInt(id));
  }
}
