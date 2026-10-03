import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
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
import {
  CancelPayrollDto,
  CreatePayrollDto,
  GenerateFreeDto,
  GenerateMaternityDto,
  GenerateManualDto,
  GeneratePayrollDto,
  GenerateSettlementDto,
  PayPayrollDto,
  ProcessPayrollDto,
  UpdatePayrollItemsDto,
} from './dto/create-payroll.dto';

/**
 * Consultar nóminas y emitir el SC-4-06 está abierto a cualquier usuario
 * autenticado, pero generarlas, editarlas, contabilizarlas, pagarlas o
 * anularlas son actos de administración: mueven el mayor y el banco. El
 * `@Roles` de método sobreescribe el de la clase.
 */
const PAYROLL_ADMIN_ROLES = [UserRole.SUPERADMIN, UserRole.ADMIN] as const;

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

  /** Catálogo de conceptos soportados y rangos legales para la UI. */
  @Get('concepts')
  getConceptCatalog() {
    return this.payrollConceptService.conceptCatalog();
  }

  @Get(':id/export/pdf')
  async exportPdf(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Query('unit') unit: 'dias' | 'horas',
    @Query('groupBy') groupBy: 'area' | 'costCenterAccount' | 'none',
    @Res() res: Response,
  ) {
    const companyId = getCompanyId(req);
    const buffer = await this.payrollReportService.generateNominaPdf(
      companyId,
      id,
      unit,
      groupBy,
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
  findOne(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const companyId = getCompanyId(req);
    return this.payrollService.findOne(companyId, id);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post()
  create(@Req() req: Request, @Body() body: CreatePayrollDto) {
    const companyId = getCompanyId(req);
    return this.payrollService.create(companyId, body);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post('generate/manual/preview')
  previewManual(@Req() req: Request, @Body() body: GenerateManualDto) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.previewManual(companyId, {
      ...body,
      concept: body.concept as any,
    });
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post('generate/manual')
  generateManual(@Req() req: Request, @Body() body: GenerateManualDto) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateManual(companyId, {
      ...body,
      concept: body.concept as any,
    });
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post('generate')
  generate(@Req() req: Request, @Body() body: GeneratePayrollDto) {
    const companyId = getCompanyId(req);
    return this.payrollService.generateFromEmployees(companyId, body);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post('generate/vacaciones')
  generateVacations(@Req() req: Request, @Body() body: GeneratePayrollDto) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateVacations(companyId, body);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post('generate/subsidio')
  generateSubsidy(@Req() req: Request, @Body() body: GeneratePayrollDto) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateSubsidy(companyId, body);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post('generate/liquidacion')
  generateVacationSettlement(
    @Req() req: Request,
    @Body() body: GenerateSettlementDto,
  ) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateVacationSettlement(companyId, body);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post('generate/maternidad')
  generateMaternity(@Req() req: Request, @Body() body: GenerateMaternityDto) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateMaternity(companyId, body);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Post('generate/libre')
  generateFree(@Req() req: Request, @Body() body: GenerateFreeDto) {
    const companyId = getCompanyId(req);
    return this.payrollConceptService.generateFree(companyId, body);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Put(':id/items')
  updateItems(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePayrollItemsDto,
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.updateItems(companyId, id, body.items);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Put(':id/process')
  process(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ProcessPayrollDto,
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.process(companyId, id, body.processedBy);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Put(':id/pay')
  markAsPaid(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PayPayrollDto,
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.markAsPaid(companyId, id, body.bankAccountId);
  }

  @Roles(...PAYROLL_ADMIN_ROLES)
  @Put(':id/cancel')
  cancel(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CancelPayrollDto,
  ) {
    const companyId = getCompanyId(req);
    return this.payrollService.cancel(companyId, id, body.reason);
  }
}
