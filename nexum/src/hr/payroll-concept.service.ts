/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { HrReportService } from './hr-report.service';
import {
  calculateIncomeTax,
  calculateMaternityBenefit,
  calculateSocialBenefit,
  calculateSocialSecurity,
  calculateSubsidy,
  calculateWeeklyAverageSalary,
  evaluateSubsidyLimit,
  overlapDays,
  overlapWorkingDays,
  round2,
  vacationDailyRate,
} from './payroll-calculations';
import {
  LEGAL_VACATION_PERIODS,
  PayrollConcept,
  PAYROLL_CONCEPT_LABELS,
  VACATION_ACCRUAL_RATE,
  WEEKS_PER_YEAR,
  WORKING_DAYS_PER_MONTH,
} from './payroll-concept';

interface GenerateInput {
  period: string;
  startDate: string;
  endDate: string;
  processedBy?: string;
  installment?: number;
}

interface FreeItemInput {
  employeeId: string;
  amount: number;
  description?: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(start: string, end: string): number {
  return Math.floor(
    (new Date(end).getTime() - new Date(start).getTime()) / MS_PER_DAY,
  ) + 1;
}

@Injectable()
export class PayrollConceptService {
  private readonly logger = new Logger(PayrollConceptService.name);

  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepo: Repository<Payroll>,
    @InjectRepository(PayrollItem)
    private readonly payrollItemRepo: Repository<PayrollItem>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepo: Repository<LeaveRequest>,
    private readonly hrReportService: HrReportService,
  ) {}

  // ── Datos de apoyo ──

  /**
   * Salario promedio mensual del trabajador: suma del devengo bruto de las
   * nóminas de salario de los doce meses anteriores. Si no hay histórico se usa
   * el salario contractual y se devuelve una advertencia.
   */
  private async averageMonthlySalary(
    companyId: number,
    employeeId: string,
    referenceDate: string,
  ): Promise<{ average: number; monthsWithHistory: number; warning?: string }> {
    const end = new Date(referenceDate);
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);

    const rows = await this.payrollItemRepo
      .createQueryBuilder('item')
      .innerJoin(Payroll, 'p', 'p.id = item."payrollId"')
      .select('COUNT(DISTINCT p.period)', 'months')
      .addSelect('COALESCE(SUM(item."grossSalary"), 0)', 'total')
      .where('item."companyId" = :companyId', { companyId })
      .andWhere('item."employeeId" = :employeeId', { employeeId })
      .andWhere("p.concept = 'salario'")
      .andWhere("p.status IN ('processed', 'paid')")
      .andWhere('p."startDate" >= :start AND p."startDate" <= :end', {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      })
      .getRawOne<{ months: string; total: string }>();

    const months = Number(rows?.months || 0);
    const total = Number(rows?.total || 0);

    if (months > 0 && total > 0) {
      return { average: round2(total / months), monthsWithHistory: months };
    }

    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId, companyId },
    });
    const fallback = Number(employee?.salary || 0);
    return {
      average: fallback,
      monthsWithHistory: 0,
      warning:
        'Sin histórico de nómina de salario: se usa el salario contractual como base.',
    };
  }

  /** Días de descanso semanal registrados en asistencias dentro del rango. */
  private async restDaysInRange(
    companyId: number,
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const rows = await this.attendanceRepo.find({
      where: {
        companyId,
        employeeId,
        status: 'holiday',
        date: Between(startDate, endDate),
      },
    });
    return rows.length;
  }

  /** Licencias aprobadas de un tipo que solapan el período. */
  private async approvedLeaves(
    companyId: number,
    type: string,
    startDate: string,
    endDate: string,
  ): Promise<LeaveRequest[]> {
    const leaves = await this.leaveRepo.find({
      where: { companyId, type: type as any, status: 'approved' },
    });
    return leaves.filter(
      (l) => overlapDays(l.startDate, l.endDate, startDate, endDate) > 0,
    );
  }

  private async ensureUnique(
    companyId: number,
    concept: PayrollConcept,
    period: string,
    installment?: number,
  ): Promise<void> {
    const existing = await this.payrollRepo.findOne({
      where: {
        companyId,
        concept,
        period,
        ...(installment ? { installment } : {}),
      },
    });
    if (existing && existing.status !== 'cancelled') {
      throw new BadRequestException(
        `Ya existe una nómina de ${PAYROLL_CONCEPT_LABELS[concept]} para el período ${period}` +
          (installment ? ` (plazo ${installment})` : ''),
      );
    }
  }

  private async savePayrollWithItems(
    companyId: number,
    concept: PayrollConcept,
    data: GenerateInput,
    items: Partial<PayrollItem>[],
    notes?: string,
  ) {
    const totalGross = round2(
      items.reduce((s, i) => s + Number(i.grossSalary || 0), 0),
    );
    const totalDeductions = round2(
      items.reduce((s, i) => s + Number(i.totalDeductions || 0), 0),
    );
    const totalNet = round2(
      items.reduce((s, i) => s + Number(i.netSalary || 0), 0),
    );

    const payroll = await this.payrollRepo.save({
      companyId,
      concept,
      period: data.period,
      startDate: data.startDate,
      endDate: data.endDate,
      installment: data.installment ?? null,
      totalGross,
      totalDeductions,
      totalNet,
      status: 'draft',
      processedBy: data.processedBy || 'Sistema',
      notes,
    });

    for (const item of items) {
      await this.payrollItemRepo.save({ ...item, payrollId: payroll.id });
    }
    return this.payrollRepo.findOne({
      where: { id: payroll.id },
      relations: ['items'],
    });
  }

  /**
   * Acumulación de vacaciones por los días que el Art. 102 considera
   * efectivamente laborados aunque no se pague salario: reposo por certificado
   * médico y licencias retribuidas de maternidad.
   *
   * El importe se calcula sobre el salario que el trabajador habría percibido
   * —no sobre la prestación, que es menor— para que enfermar o parir no
   * deteriore su fondo de vacaciones.
   */
  private vacationAccrual(
    emp: Employee,
    workingDays: number,
  ): { vacationDays: number; vacationProvision: number } {
    const days = Math.max(0, Math.min(workingDays, WORKING_DAYS_PER_MONTH));
    const referenceSalary =
      (Number(emp.salary || 0) / WORKING_DAYS_PER_MONTH) * days;
    return {
      vacationDays: round2(days * VACATION_ACCRUAL_RATE),
      vacationProvision: round2(referenceSalary * VACATION_ACCRUAL_RATE),
    };
  }

  private baseItem(emp: Employee, companyId: number): Partial<PayrollItem> {
    return {
      companyId,
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      employeeDocument: emp.documentId || '',
      position: emp.position || '',
      costCenterId: emp.costCenterId || null,
      expenseAccountCode: emp.expenseAccountCode || null,
      occupationalCategory: emp.occupationalCategory || '0020',
      baseSalary: 0,
      overtimeHours: 0,
      overtimePay: 0,
      bonuses: 0,
      commissions: 0,
      allowances: 0,
      socialSecurity: 0,
      healthInsurance: 0,
      pension: 0,
      taxWithholding: 0,
      unionDues: 0,
      otherDeductions: 0,
      vacationProvision: 0,
      subsidyRetention: 0,
      status: 'active',
    };
  }

  // ── Vacaciones ──

  /**
   * Genera la nómina de vacaciones del período a partir de las licencias de
   * vacaciones aprobadas. El pago se carga a la provisión 492, nunca a gasto.
   */
  async generateVacations(companyId: number, data: GenerateInput) {
    await this.ensureUnique(companyId, 'vacaciones', data.period);

    const leaves = await this.approvedLeaves(
      companyId,
      'vacation',
      data.startDate,
      data.endDate,
    );
    if (leaves.length === 0) {
      throw new BadRequestException(
        'No hay licencias de vacaciones aprobadas en el período',
      );
    }

    const items: Partial<PayrollItem>[] = [];
    const warnings: string[] = [];
    // Saldo acumulado por trabajador: es el fondo del que sale la retribución.
    const balances = await this.hrReportService.vacationBalances(
      companyId,
      data.period,
    );

    for (const leave of leaves) {
      const emp = await this.employeeRepo.findOne({
        where: { id: leave.employeeId, companyId },
      });
      if (!emp) continue;

      const days = overlapWorkingDays(
        leave.startDate,
        leave.endDate,
        data.startDate,
        data.endDate,
      );
      if (days <= 0) continue;

      // Art. 105: el descanso se otorga por períodos de 30, 20, 15, 10 o 7
      // días naturales. Es un aviso y no un bloqueo porque el propio artículo
      // admite pactar excepciones a solicitud del trabajador.
      const naturalDays = overlapDays(
        leave.startDate,
        leave.endDate,
        leave.startDate,
        leave.endDate,
      );
      if (!LEGAL_VACATION_PERIODS.includes(naturalDays)) {
        warnings.push(
          `${emp.firstName} ${emp.lastName}: licencia de ${naturalDays} días ` +
            'naturales — los períodos del Art. 105 son 30, 20, 15, 10 o 7',
        );
      }

      // ── Retribución de las vacaciones (Art. 102 Ley 116) ──
      // La cuantía es lo acumulado, no la tarifa vigente: se paga a razón del
      // importe acumulado por día acumulado. Así pagar N días debita del fondo
      // exactamente lo que esos N días generaron y la 492 vuelve a cero al
      // agotarse el saldo, sin el descuadre que provocaría un cambio de
      // salario entre la acumulación y el disfrute.
      const salary = Number(emp.salary || 0);
      const balance = balances.get(emp.id);
      const contractualRate = round2(salary / WORKING_DAYS_PER_MONTH);
      const hasBalance = !!balance && balance.days > 0 && balance.amount > 0;
      // Sin acumulado —primer año o apertura del sistema— se paga a la tarifa
      // contractual, dejando constancia en la línea.
      const dailyRate = vacationDailyRate(balance, contractualRate);
      const gross = round2(dailyRate * days);
      const socialSecurity = calculateSocialSecurity(gross);
      const taxWithholding = calculateIncomeTax(gross);
      const totalDeductions = round2(socialSecurity + taxWithholding);

      const employeeName = `${emp.firstName} ${emp.lastName}`.trim();
      if (!hasBalance) {
        warnings.push(
          `${employeeName}: sin acumulado de vacaciones, se paga a la tarifa contractual`,
        );
      } else if (days > balance.days) {
        warnings.push(
          `${employeeName}: disfruta ${days} días laborables y solo tiene ` +
            `${round2(balance.days)} acumulados`,
        );
      }

      items.push({
        ...this.baseItem(emp, companyId),
        baseSalary: salary,
        grossSalary: gross,
        socialSecurity,
        taxWithholding,
        totalDeductions,
        netSalary: round2(gross - totalDeductions),
        leaveRequestId: leave.id,
        averageSalary: salary,
        paidUnits: days,
        appliedRate: 1,
        notes:
          `Vacaciones ${leave.startDate} a ${leave.endDate}: ` +
          `${days} días laborables × ${dailyRate} ` +
          (hasBalance
            ? `(tarifa acumulada: ${round2(balance.amount)} / ${round2(balance.days)} días)`
            : `(salario / ${WORKING_DAYS_PER_MONTH}, sin acumulado)`),
      });
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'Las licencias de vacaciones no tienen trabajadores válidos',
      );
    }

    return this.savePayrollWithItems(
      companyId,
      'vacaciones',
      data,
      items,
      warnings.length ? warnings.join(' | ') : undefined,
    );
  }

  // ── Liquidación por terminación de la relación laboral (Art. 52) ──

  /**
   * Paga al trabajador la totalidad de su saldo de vacaciones acumulado al
   * terminar el vínculo laboral. Se carga íntegramente a la provisión 492,
   * igual que el disfrute, de modo que el submayor y el mayor llegan a cero
   * juntos. La unicidad es por trabajador y período —pueden terminar varios
   * en el mismo mes—, no por concepto como el resto de las nóminas.
   */
  async generateVacationSettlement(
    companyId: number,
    data: GenerateInput & { employeeId?: string },
  ) {
    if (!data.employeeId) {
      throw new BadRequestException(
        'La liquidación de vacaciones requiere indicar el trabajador',
      );
    }
    const emp = await this.employeeRepo.findOne({
      where: { id: data.employeeId, companyId },
    });
    if (!emp) {
      throw new NotFoundException('Trabajador no encontrado');
    }
    const employeeName = `${emp.firstName} ${emp.lastName}`.trim();

    // Unicidad por trabajador dentro del período.
    const settlements = await this.payrollRepo.find({
      where: { companyId, concept: 'liquidacion', period: data.period },
      relations: ['items'],
    });
    const duplicated = settlements
      .filter((p) => p.status !== 'cancelled')
      .some((p) =>
        (p.items || []).some((i) => i.employeeId === data.employeeId),
      );
    if (duplicated) {
      throw new BadRequestException(
        `Ya existe una liquidación de ${employeeName} en el período ${data.period}`,
      );
    }

    const balances = await this.hrReportService.vacationBalances(
      companyId,
      data.period,
    );
    const balance = balances.get(emp.id);
    if (!balance || balance.days <= 0 || balance.amount <= 0) {
      throw new BadRequestException(
        `${employeeName} no tiene vacaciones acumuladas que liquidar`,
      );
    }

    const days = round2(balance.days);
    const gross = round2(balance.amount);
    const rate = round2(balance.amount / balance.days);
    const socialSecurity = calculateSocialSecurity(gross);
    const taxWithholding = calculateIncomeTax(gross);
    const totalDeductions = round2(socialSecurity + taxWithholding);

    const items: Partial<PayrollItem>[] = [
      {
        ...this.baseItem(emp, companyId),
        baseSalary: Number(emp.salary || 0),
        grossSalary: gross,
        socialSecurity,
        taxWithholding,
        totalDeductions,
        netSalary: round2(gross - totalDeductions),
        averageSalary: Number(emp.salary || 0),
        paidUnits: days,
        appliedRate: 1,
        notes:
          `Liquidación por terminación (Art. 52): ` +
          `${days} días acumulados × ${rate}`,
      },
    ];

    return this.savePayrollWithItems(companyId, 'liquidacion', data, items);
  }

  // ── Subsidio por enfermedad o accidente (Art. 39-46) ──

  async generateSubsidy(companyId: number, data: GenerateInput) {
    await this.ensureUnique(companyId, 'subsidio', data.period);

    const leaves = await this.approvedLeaves(
      companyId,
      'sick',
      data.startDate,
      data.endDate,
    );
    if (leaves.length === 0) {
      throw new BadRequestException(
        'No hay licencias por enfermedad aprobadas en el período',
      );
    }

    const items: Partial<PayrollItem>[] = [];
    const warnings: string[] = [];

    for (const leave of leaves) {
      const emp = await this.employeeRepo.findOne({
        where: { id: leave.employeeId, companyId },
      });
      if (!emp) continue;

      // Art. 46: sin certificado médico el subsidio se suspende.
      if (!leave.medicalCertificate) {
        warnings.push(
          `${emp.firstName} ${emp.lastName}: sin certificado médico, subsidio suspendido (Art. 46)`,
        );
        continue;
      }

      const origin = leave.origin || 'common';
      const hospitalized = leave.hospitalized || !!leave.hospitalizationStart;

      // Días de la licencia que caen en este período.
      const rangeStart =
        new Date(leave.startDate) > new Date(data.startDate)
          ? leave.startDate
          : data.startDate;
      const rangeEnd =
        new Date(leave.endDate) < new Date(data.endDate)
          ? leave.endDate
          : data.endDate;
      const incapacityDays = daysBetween(rangeStart, rangeEnd);

      const restDays = await this.restDaysInRange(
        companyId,
        emp.id,
        rangeStart,
        rangeEnd,
      );

      // Carencia ya aplicada: días de la licencia anteriores a este período.
      const daysBeforePeriod = Math.max(
        0,
        daysBetween(leave.startDate, data.startDate) - 1,
      );
      const waitingDaysAlreadyApplied = Math.min(
        origin === 'common' && !hospitalized ? 3 : 0,
        daysBeforePeriod,
      );

      const { average, warning } = await this.averageMonthlySalary(
        companyId,
        emp.id,
        leave.startDate,
      );
      if (warning) warnings.push(`${emp.firstName} ${emp.lastName}: ${warning}`);

      // Art. 43: días acumulados de incapacidad en los últimos 12 meses.
      const yearAgo = new Date(leave.startDate);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const priorLeaves = await this.leaveRepo.find({
        where: {
          companyId,
          employeeId: emp.id,
          type: 'sick',
          status: 'approved',
        },
      });
      const accumulatedDays = priorLeaves.reduce(
        (s, l) =>
          s +
          overlapDays(
            l.startDate,
            l.endDate,
            yearAgo.toISOString().split('T')[0],
            leave.endDate,
          ),
        0,
      );
      const limitCheck = evaluateSubsidyLimit(accumulatedDays);
      if (limitCheck.level !== 'none') {
        warnings.push(`${emp.firstName} ${emp.lastName}: ${limitCheck.message}`);
      }

      const result = calculateSubsidy({
        averageMonthlySalary: average,
        incapacityDays,
        restDays,
        origin,
        hospitalized,
        waitingDaysAlreadyApplied,
      });

      if (result.amount <= 0) {
        warnings.push(
          `${emp.firstName} ${emp.lastName}: sin días subsidiables en el período`,
        );
        continue;
      }

      items.push({
        ...this.baseItem(emp, companyId),
        grossSalary: result.amount,
        totalDeductions: 0,
        netSalary: result.amount,
        leaveRequestId: leave.id,
        averageSalary: average,
        paidUnits: result.paidDays,
        appliedRate: result.rate,
        // Los días de reposo médico acumulan vacaciones (Art. 102).
        ...this.vacationAccrual(emp, result.paidDays),
        notes:
          `Subsidio ${origin === 'occupational' ? 'profesional' : 'común'}` +
          `${hospitalized ? ' hospitalizado' : ''}: ${result.paidDays} días × ` +
          `${result.dailyRate} × ${(result.rate * 100).toFixed(0)} %` +
          (result.minimumApplied ? ' (mínimo Art. 41)' : ''),
      });
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'Ninguna licencia generó subsidio en el período. ' + warnings.join(' | '),
      );
    }

    return this.savePayrollWithItems(
      companyId,
      'subsidio',
      data,
      items,
      warnings.length ? warnings.join(' | ') : undefined,
    );
  }

  // ── Maternidad (Art. 15-38) ──

  /**
   * Genera la nómina de maternidad para un plazo (installment 1, 2 o 3).
   * En el sector estatal el débito va a 164-0030; en el no estatal la Filial
   * INSS paga directamente y la nómina queda solo informativa.
   */
  async generateMaternity(companyId: number, data: GenerateInput) {
    if (!data.installment || data.installment < 1 || data.installment > 3) {
      throw new BadRequestException(
        'La nómina de maternidad requiere el plazo (installment 1, 2 o 3)',
      );
    }
    await this.ensureUnique(
      companyId,
      'maternidad',
      data.period,
      data.installment,
    );

    const leaves = await this.approvedLeaves(
      companyId,
      'maternity',
      data.startDate,
      data.endDate,
    );
    if (leaves.length === 0) {
      throw new BadRequestException(
        'No hay licencias de maternidad aprobadas en el período',
      );
    }

    const items: Partial<PayrollItem>[] = [];
    const warnings: string[] = [];

    for (const leave of leaves) {
      // El beneficiario puede ser la madre o el familiar que asume el cuidado.
      const beneficiaryId = leave.beneficiaryEmployeeId || leave.employeeId;
      const emp = await this.employeeRepo.findOne({
        where: { id: beneficiaryId, companyId },
      });
      if (!emp) continue;

      // Base: salario devengado en los 12 meses anteriores (Art. 16) o entre
      // las semanas laboradas si fueron menos (Art. 17).
      const { average, monthsWithHistory, warning } =
        await this.averageMonthlySalary(companyId, emp.id, leave.startDate);
      if (warning) warnings.push(`${emp.firstName} ${emp.lastName}: ${warning}`);

      const salaryInPeriod = average * Math.min(monthsWithHistory || 12, 12);
      const weeksWorked =
        monthsWithHistory > 0 && monthsWithHistory < 12
          ? monthsWithHistory * (WEEKS_PER_YEAR / 12)
          : undefined;
      const weeklyAverage = calculateWeeklyAverageSalary({
        salaryInPeriod,
        weeksWorked,
      });

      // Semanas del plazo (Art. 18): 1 = prenatal (6 u 8 si embarazo múltiple),
      // 2 = primeras 6 semanas posnatales, 3 = últimas 6 semanas posnatales.
      const prenatalWeeks = leave.multiplePregnancy ? 8 : 6;
      const weeks =
        data.installment === 1 ? prenatalWeeks : 6;

      const benefit = calculateMaternityBenefit(weeklyAverage, weeks);
      const isStateSector = emp.employmentSector !== 'non_state';

      items.push({
        ...this.baseItem(emp, companyId),
        grossSalary: benefit,
        totalDeductions: 0,
        netSalary: benefit,
        leaveRequestId: leave.id,
        averageSalary: weeklyAverage,
        paidUnits: weeks,
        appliedRate: 1,
        // La licencia retribuida de maternidad acumula vacaciones (Art. 102);
        // se computan 5 días laborables por semana de prestación.
        ...this.vacationAccrual(emp, weeks * 5),
        notes:
          `Maternidad plazo ${data.installment} (${weeks} semanas × ${weeklyAverage})` +
          (isStateSector
            ? ' — cargo a 164-0030'
            : ' — sector no estatal: paga la Filial INSS (Art. 37), sin asiento'),
      });
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'Ninguna licencia de maternidad generó prestación en el período',
      );
    }

    return this.savePayrollWithItems(
      companyId,
      'maternidad',
      data,
      items,
      warnings.length ? warnings.join(' | ') : undefined,
    );
  }

  // ── Concepto libre ──

  /**
   * Genera una nómina de concepto libre con líneas manuales (pagos extras,
   * estímulos). Se aplican las retenciones habituales sobre cada importe.
   */
  async generateFree(
    companyId: number,
    data: GenerateInput & { items: FreeItemInput[] },
  ) {
    await this.ensureUnique(companyId, 'libre', data.period);
    if (!data.items?.length) {
      throw new BadRequestException(
        'La nómina de concepto libre requiere al menos una línea',
      );
    }

    const employeeIds = [...new Set(data.items.map((i) => i.employeeId))];
    const employees = await this.employeeRepo.findBy({
      companyId,
      id: In(employeeIds),
    });
    const byId = new Map(employees.map((e) => [e.id, e]));

    const items: Partial<PayrollItem>[] = [];
    for (const line of data.items) {
      const emp = byId.get(line.employeeId);
      if (!emp) {
        throw new NotFoundException(
          `Empleado ${line.employeeId} no encontrado`,
        );
      }
      const gross = round2(Number(line.amount) || 0);
      if (gross <= 0) continue;

      const socialSecurity = calculateSocialSecurity(gross);
      const taxWithholding = calculateIncomeTax(gross);
      const totalDeductions = round2(socialSecurity + taxWithholding);

      items.push({
        ...this.baseItem(emp, companyId),
        grossSalary: gross,
        socialSecurity,
        taxWithholding,
        totalDeductions,
        netSalary: round2(gross - totalDeductions),
        averageSalary: gross,
        paidUnits: 1,
        appliedRate: 1,
        notes: line.description || 'Concepto libre',
      });
    }

    if (items.length === 0) {
      throw new BadRequestException('Todas las líneas tienen importe cero');
    }

    return this.savePayrollWithItems(companyId, 'libre', data, items);
  }
}
