import {
  Controller,
  Get,
  ParseIntPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HrReportService } from './hr-report.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

/**
 * Todos estos reportes exponen remuneraciones nominales —submayor, salario
 * devengado, fichero de acreditación con cuentas bancarias y plantilla con
 * tarifas—, así que quedan reservados a administración en pleno, no al rol de
 * usuario corriente.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
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

  /** Impuestos empresariales (14 % SS + 5 % UFT) por trabajador en el período. */
  @Get('employer-taxes')
  employerTaxesReport(
    @Req() req: Request,
    @Query('period') period?: string,
  ) {
    return this.service.employerTaxesReport(
      getCompanyId(req),
      this.periodOrCurrent(period),
    );
  }

  @Get('accreditation')
  accreditationFile(
    @Req() req: Request,
    @Query('period') period?: string,
    @Query('payrollId', new ParseIntPipe({ optional: true })) payrollId?: number,
  ) {
    return this.service.accreditationFile(
      getCompanyId(req),
      this.periodOrCurrent(period),
      payrollId,
    );
  }

  /** Mismo fichero en el DBF que exige el banco (estructura de nominalimpia.dbf). */
  @Get('accreditation/dbf')
  async accreditationDbf(
    @Req() req: Request,
    @Res() res: Response,
    @Query('period') period?: string,
    @Query('payrollId', new ParseIntPipe({ optional: true })) payrollId?: number,
  ) {
    const resolved = this.periodOrCurrent(period);
    const { file, omitted } = await this.service.accreditationDbf(
      getCompanyId(req),
      resolved,
      payrollId,
    );
    const name = payrollId ? `acreditacion-nomina-${payrollId}` : `acreditacion-${resolved}`;
    res.setHeader('Content-Type', 'application/x-dbf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.dbf"`);
    res.setHeader('Content-Length', file.length);
    // Trabajadores sin CI o cuenta: el cliente los muestra como aviso.
    res.setHeader('Access-Control-Expose-Headers', 'X-Omitted-Employees');
    res.setHeader('X-Omitted-Employees', encodeURIComponent(omitted.join('|')));
    res.end(file);
  }

  @Get('staffing')
  staffingReport(@Req() req: Request) {
    return this.service.staffingReport(getCompanyId(req));
  }
}
