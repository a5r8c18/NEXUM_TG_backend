import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { WorkingCapitalService } from './working-capital.service';
import { getCompanyId } from '../common/get-company-id';

@Controller('working-capital')
export class WorkingCapitalController {
  constructor(private readonly workingCapitalService: WorkingCapitalService) {}

  @Get('report')
  getReport(@Req() req: Request, @Query('period') period?: string) {
    const companyId = getCompanyId(req);
    return this.workingCapitalService.getWorkingCapitalReport(
      companyId,
      period ? parseInt(period, 10) : 90,
    );
  }
}
