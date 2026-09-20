import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { HrReportService } from './hr-report.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('hr/reports')
export class HrReportController {
  constructor(private readonly service: HrReportService) {}

  /** Período por defecto: mes en curso ('YYYY-MM'). */
  private periodOrCurrent(period?: string): string {
    return period || new Date().toISOString().slice(0, 7);
  }

  @Get('vacation-submayor')
  vacationSubmayor(@Req() req: Request, @Query('period') period?: string) {
    return this.service.vacationSubmayor(
      getCompanyId(req),
      this.periodOrCurrent(period),
    );
  }

  @Get('payroll-cnc')
  payrollCnc(@Req() req: Request, @Query('period') period?: string) {
    return this.service.payrollCnc(
      getCompanyId(req),
      this.periodOrCurrent(period),
    );
  }

  @Get('accreditation')
  accreditationFile(@Req() req: Request, @Query('period') period?: string) {
    return this.service.accreditationFile(
      getCompanyId(req),
      this.periodOrCurrent(period),
    );
  }

  @Get('staffing')
  staffingReport(@Req() req: Request) {
    return this.service.staffingReport(getCompanyId(req));
  }
}
