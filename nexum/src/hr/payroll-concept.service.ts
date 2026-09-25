/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, In, Repository } from 'typeorm';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { HrReportService } from './hr-report.service';
import {
  calculateMaternityBenefit,
  calculateSocialBenefit,
  calculateSubsidy,
  calculateWeeklyAverageSalary,
  evaluateSubsidyLimit,
  overlapDays,
  overlapWorkingDays,
  round2,
  vacationDailyRate,
} from './payroll-calculations';
import {
  incrementalTaxes,
  monthlyTaxableTotals,
} from './monthly-taxable';
import {
  LEGAL_VACATION_PERIODS,
  MINIMUM_WAGE,
  PayrollConcept,
  PAYROLL_CONCEPT_LABELS,
  SOCIAL_BENEFIT_RATE,
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

/**
 * Porción de una licencia que una línea de nómina va a retribuir. Se
 * reverifica dentro de la transacción de guardado, bajo bloqueo de la fila
 * de la licencia, para que dos generaciones concurrentes no paguen lo mismo.
 */
interface LeaveClaim {
  leaveId: string;
  /** Unidades que se pagan (paidUnits de la línea). */
  units: number;
  /** Bruto que se paga (grossSalary de la línea). */
  amount: number;
  /** Tope acumulado de unidades (duración total de la licencia). */
  cap?: number;
  /** Plazo de maternidad: 1-3 se paga una vez; 4 admite meses sucesivos. */
  installment?: number;
  /** Rango cubierto por la nómina: dos nóminas no pueden solaparlo. */
  rangeStart: string;
  rangeEnd: string;
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

  /**
   * Días ya retribuidos de cada licencia por líneas de nóminas NO canceladas
   * (borrador, procesada o pagada): es la comprobación que evita el doble
   * pago cuando rangos de período solapados cubren los mismos días de la
   * licencia. Para maternidad devuelve además los plazos ya generados y el
   * rango cubierto, porque cada plazo (Art. 18 DL 56/2021) se paga una sola
   * vez y la prestación social mensual (plazo 4) no debe repetirse sobre el
   * mismo rango de fechas.
   */
  private async settledLeaveRows(
    companyId: number,
    leaveIds: string[],
    manager?: EntityManager,
  ): Promise<
    {
      leaveId: string;
      installment: number | null;
      pStart: string;
      pEnd: string;
      days: number;
      amount: number;
    }[]
  > {
    if (!leaveIds.length) return [];
    const itemRepo = manager
      ? manager.getRepository(PayrollItem)
      : this.payrollItemRepo;
    const rows = await itemRepo
      .createQueryBuilder('item')
      .innerJoin(Payroll, 'p', 'p.id = item."payrollId"')
      .select('item."leave_request_id"', 'leaveId')
      .addSelect('p."installment"', 'installment')
      .addSelect('p."startDate"', 'pStart')
      .addSelect('p."endDate"', 'pEnd')
      .addSelect('COALESCE(SUM(item."paid_units"), 0)', 'days')
      .addSelect('COALESCE(SUM(item."grossSalary"), 0)', 'amount')
      .where('item."companyId" = :companyId', { companyId })
      .andWhere('item."leave_request_id" IN (:...leaveIds)', { leaveIds })
      .andWhere('p."status" <> :cancelled', { cancelled: 'cancelled' })
      .groupBy('item."leave_request_id"')
      .addGroupBy('p."installment"')
      .addGroupBy('p."startDate"')
      .addGroupBy('p."endDate"')
      .getRawMany<{
        leaveId: string;
        installment: number | null;
        pStart: string;
        pEnd: string;
        days: string;
        amount: string;
      }>();
    return rows.map((r) => ({
      leaveId: r.leaveId,
      installment: r.installment != null ? Number(r.installment) : null,
      pStart: r.pStart,
      pEnd: r.pEnd,
      days: Number(r.days),
      amount: Number(r.amount),
    }));
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

  /**
   * Reverifica cada claim contra lo ya pagado de la licencia. Se ejecuta
   * dentro de la transacción con la fila de la licencia bloqueada, así que
   * una generación concurrente espera y ve el resultado de la otra: es la
   * barrera real contra el doble pago, no un chequeo previo optimista.
   *
   * Reglas: la misma licencia no admite dos nóminas cuyos rangos de fechas
   * se solapen salvo que sean plazos distintos de maternidad; cada plazo 1-3
   * se paga una sola vez; el plazo 4 solo se repite en rangos disjuntos; y
   * las unidades acumuladas nunca exceden la duración de la licencia.
   */
  private assertLeaveClaims(
    settled: {
      leaveId: string;
      installment: number | null;
      pStart: string;
      pEnd: string;
      days: number;
      amount: number;
    }[],
    claims: LeaveClaim[],
  ): void {
    for (const claim of claims) {
      const rows = settled.filter((r) => r.leaveId === claim.leaveId);
      let duplicated = false;
      if (claim.installment === 4) {
        // Prestación social mensual: misma licencia, rangos disjuntos.
        duplicated = rows.some(
          (r) =>
            r.installment === 4 &&
            overlapDays(r.pStart, r.pEnd, claim.rangeStart, claim.rangeEnd) > 0,
        );
      } else if (claim.installment != null) {
        // Prestación económica: cada plazo (Art. 18 DL 56/2021) una vez.
        duplicated = rows.some((r) => r.installment === claim.installment);
      } else {
        // Vacaciones y subsidio: ni rangos solapados ni más unidades que
        // la duración total de la licencia.
        duplicated =
          rows.some(
            (r) =>
              overlapDays(r.pStart, r.pEnd, claim.rangeStart, claim.rangeEnd) >
              0,
          ) || rows.reduce((s, r) => s + r.days, 0) + claim.units > (claim.cap ?? Infinity);
      }
      if (duplicated) {
        throw new BadRequestException(
          'La licencia ya fue liquidada por otra nómina para ese período ' +
            'o plazo; cancélela primero si debe regenerarse',
        );
      }
    }
  }

  private async savePayrollWithItems(
    companyId: number,
    concept: PayrollConcept,
    data: GenerateInput,
    items: Partial<PayrollItem>[],
    notes?: string,
    claims: LeaveClaim[] = [],
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

    // La nómina, sus líneas y el marcado de las licencias se confirman en una
    // sola transacción: si la reverificación detecta un pago duplicado no
    // queda ni la nómina ni el avance del contador.
    const payrollId = await this.payrollRepo.manager.transaction(
      async (manager) => {
        if (claims.length) {
          const leaveIds = [...new Set(claims.map((c) => c.leaveId))].sort();
          // Bloqueo pesimista: serializa las generaciones que tocan la misma
          // licencia; la segunda espera y reverifica contra lo ya confirmado.
          await manager
            .getRepository(LeaveRequest)
            .createQueryBuilder('l')
            .setLock('pessimistic_write')
            .where('l.id IN (:...leaveIds)', { leaveIds })
            .getMany();
          const settled = await this.settledLeaveRows(
            companyId,
            leaveIds,
            manager,
          );
          this.assertLeaveClaims(settled, claims);
          for (const claim of claims) {
            await manager.getRepository(LeaveRequest).increment(
              { id: claim.leaveId },
              'settledUnits',
              claim.units,
            );
            await manager.getRepository(LeaveRequest).increment(
              { id: claim.leaveId },
              'settledAmount',
              claim.amount,
            );
          }
        }

        const payroll = await manager.getRepository(Payroll).save({
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
          await manager
            .getRepository(PayrollItem)
            .save({ ...item, payrollId: payroll.id });
        }
        return payroll.id as number;
      },
    );

    return this.payrollRepo.findOne({
      where: { id: payrollId },
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
    const claims: LeaveClaim[] = [];
    // Saldo acumulado por trabajador: es el fondo del que sale la retribución.
    const balances = await this.hrReportService.vacationBalances(
      companyId,
      data.period,
    );
    // Lo ya devengado y retenido en otras nóminas del período (IIP y CESS se
    // calculan sobre el acumulado mensual, no por nómina).
    const priorTotals = await monthlyTaxableTotals(
      this.payrollItemRepo,
      companyId,
      data.period,
    );
    // Lo ya retribuido de cada licencia por nóminas no canceladas: si el
    // rango de esta nómina solapa uno ya pagado se pagarían los mismos días
    // dos veces; si es disjunto solo quedan los días que resten de la
    // duración total de la licencia.
    const settledRows = await this.settledLeaveRows(
      companyId,
      leaves.map((l) => l.id),
    );

    for (const leave of leaves) {
      const emp = await this.employeeRepo.findOne({
        where: { id: leave.employeeId, companyId },
      });
      if (!emp) continue;

      const leaveRows = settledRows.filter((r) => r.leaveId === leave.id);
      if (
        leaveRows.some(
          (r) =>
            overlapDays(r.pStart, r.pEnd, data.startDate, data.endDate) > 0,
        )
      ) {
        warnings.push(
          `${leave.employeeName}: licencia ya liquidada por una nómina de ` +
            'rango solapado; cancélela si debe regenerarse',
        );
        continue;
      }

      // El recurso finito son los días laborables de toda la licencia, no los
      // del período: ya pagados en otra nómina no vuelven a pagarse.
      const totalWorkingDays = overlapWorkingDays(
        leave.startDate,
        leave.endDate,
        leave.startDate,
        leave.endDate,
      );
      const settledDays = leaveRows.reduce((s, r) => s + r.days, 0);
      const periodDays = overlapWorkingDays(
        leave.startDate,
        leave.endDate,
        data.startDate,
        data.endDate,
      );
      const days = Math.min(periodDays, Math.max(0, totalWorkingDays - settledDays));
      if (days <= 0) {
        warnings.push(
          `${leave.employeeName}: licencia de vacaciones ya liquidada en otra(s) nómina(s)`,
        );
        continue;
      }
      if (days < periodDays) {
        warnings.push(
          `${leave.employeeName}: ${settledDays} día(s) ya liquidados; se pagan ${days} restantes`,
        );
      }

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
      // IIP y CESS sobre el acumulado mensual de todos los conceptos de pago
      // (Res. 41/2023): se retiene la diferencia con lo ya
      // retenido en las demás nóminas del período.
      const { socialSecurity, taxWithholding } = incrementalTaxes(
        priorTotals.get(emp.id),
        gross,
      );
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
      claims.push({
        leaveId: leave.id,
        units: days,
        amount: gross,
        cap: totalWorkingDays,
        rangeStart: data.startDate,
        rangeEnd: data.endDate,
      });
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'Las licencias de vacaciones no tienen trabajadores válidos. ' +
          warnings.join(' | '),
      );
    }

    return this.savePayrollWithItems(
      companyId,
      'vacaciones',
      data,
      items,
      warnings.length ? warnings.join(' | ') : undefined,
      claims,
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

    // El índice único es por concepto y período, así que todas las
    // terminaciones del mes comparten una sola nómina de liquidación: la
    // unicidad real es por trabajador dentro de esa nómina.
    const settlement = await this.payrollRepo.findOne({
      where: { companyId, concept: 'liquidacion', period: data.period },
      relations: ['items'],
    });
    if (settlement && settlement.status === 'cancelled') {
      throw new BadRequestException(
        `Ya existe una nómina de liquidación cancelada para ${data.period}: ` +
          'elimínela o genere la liquidación en otro período',
      );
    }
    const alreadySettled = (settlement?.items || []).some(
      (i) => i.employeeId === data.employeeId,
    );
    if (alreadySettled) {
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
    const priorTotals = await monthlyTaxableTotals(
      this.payrollItemRepo,
      companyId,
      data.period,
    );
    const { socialSecurity, taxWithholding } = incrementalTaxes(
      priorTotals.get(emp.id),
      gross,
    );
    const totalDeductions = round2(socialSecurity + taxWithholding);

    const item: Partial<PayrollItem> = {
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
    };

    // Si el período ya tiene su nómina de liquidación en borrador, la nueva
    // terminación se añade como línea y se recalculan los totales.
    if (settlement) {
      if (settlement.status !== 'draft') {
        throw new BadRequestException(
          `La nómina de liquidación del período ${data.period} ya está ` +
            `${settlement.status === 'processed' ? 'procesada' : 'pagada'}: ` +
            'no se pueden añadir trabajadores',
        );
      }
      await this.payrollItemRepo.save({
        ...item,
        payrollId: settlement.id,
      });
      settlement.totalGross = round2(
        Number(settlement.totalGross) + gross,
      );
      settlement.totalDeductions = round2(
        Number(settlement.totalDeductions) + totalDeductions,
      );
      settlement.totalNet = round2(
        Number(settlement.totalNet) + item.netSalary!,
      );
      await this.payrollRepo.save(settlement);
      return this.payrollRepo.findOne({
        where: { id: settlement.id },
        relations: ['items'],
      });
    }

    return this.savePayrollWithItems(companyId, 'liquidacion', data, [item]);
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
    const claims: LeaveClaim[] = [];
    // Días ya retribuidos por nóminas no canceladas: una licencia no se paga
    // dos veces aunque los rangos de dos períodos solapen sus mismos días.
    const settledRows = await this.settledLeaveRows(
      companyId,
      leaves.map((l) => l.id),
    );

    for (const leave of leaves) {
      const emp = await this.employeeRepo.findOne({
        where: { id: leave.employeeId, companyId },
      });
      if (!emp) continue;

      const leaveRows = settledRows.filter((r) => r.leaveId === leave.id);
      if (
        leaveRows.some(
          (r) =>
            overlapDays(r.pStart, r.pEnd, data.startDate, data.endDate) > 0,
        )
      ) {
        warnings.push(
          `${emp.firstName} ${emp.lastName}: licencia ya liquidada por una ` +
            'nómina de rango solapado; cancélela si debe regenerarse',
        );
        continue;
      }

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

      // Los días naturales de incapacidad ya retribuidos quedan fuera: el
      // recurso finito es la duración total de la licencia.
      const settledDays = leaveRows.reduce((s, r) => s + r.days, 0);
      const totalLeaveDays =
        Number(leave.days) || daysBetween(leave.startDate, leave.endDate);
      const payableDays = Math.min(
        incapacityDays,
        Math.max(0, totalLeaveDays - settledDays),
      );
      if (payableDays <= 0) {
        warnings.push(
          `${emp.firstName} ${emp.lastName}: licencia ya liquidada en otra(s) nómina(s)`,
        );
        continue;
      }
      if (payableDays < incapacityDays) {
        warnings.push(
          `${emp.firstName} ${emp.lastName}: ${settledDays} día(s) ya ` +
            `liquidados; se subsidia ${payableDays} restantes`,
        );
      }

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
        incapacityDays: payableDays,
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
      claims.push({
        leaveId: leave.id,
        units: result.paidDays,
        amount: result.amount,
        cap: totalLeaveDays,
        rangeStart: data.startDate,
        rangeEnd: data.endDate,
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
      claims,
    );
  }

  // ── Maternidad (DL 56/2021, mod. DL 71/2023) ──

  /**
   * Genera la nómina de maternidad: plazos 1-3 pagan la prestación económica
   * (Art. 18 DL 56/2021) y el plazo 4 la prestación social mensual del período
   * (Art. 30.1). En el sector estatal el débito va a 164-0030; en el no
   * estatal la Filial INSS paga directamente y la nómina queda informativa.
   */
  async generateMaternity(companyId: number, data: GenerateInput) {
    if (!data.installment || data.installment < 1 || data.installment > 4) {
      throw new BadRequestException(
        'La nómina de maternidad requiere el plazo (installment 1-3) o la ' +
          'prestación social mensual (installment 4)',
      );
    }
    await this.ensureUnique(
      companyId,
      'maternidad',
      data.period,
      data.installment,
    );

    // Plazo 4: prestación social mensual, que corre desde el vencimiento de la
    // licencia posnatal hasta que el menor arribe a su primer año de vida.
    if (data.installment === 4) {
      return this.generateMaternitySocialBenefit(companyId, data);
    }

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
    const claims: LeaveClaim[] = [];
    // Cada plazo de la prestación económica (Art. 18 DL 56/2021) se paga una
    // sola vez por licencia: plazos ya liquidados se saltan.
    const settledRows = await this.settledLeaveRows(
      companyId,
      leaves.map((l) => l.id),
    );

    for (const leave of leaves) {
      if (
        settledRows.some(
          (r) => r.leaveId === leave.id && r.installment === data.installment,
        )
      ) {
        warnings.push(
          `${leave.employeeName}: el plazo ${data.installment} de esta ` +
            'licencia ya fue liquidado',
        );
        continue;
      }

      // El beneficiario puede ser la madre o el familiar que asume el cuidado.
      const beneficiaryId = leave.beneficiaryEmployeeId || leave.employeeId;
      const emp = await this.employeeRepo.findOne({
        where: { id: beneficiaryId, companyId },
      });
      if (!emp) continue;

      // Base: salario devengado en los 12 meses anteriores (Art. 16 DL 56/2021)
      // o entre las semanas laboradas si fueron menos (Art. 17).
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

      // Semanas del plazo (Art. 18 DL 56/2021): 1 = prenatal (6 u 8 si embarazo
      // múltiple, Art. 6.2), 2 = primeras 6 semanas posnatales, 3 = últimas 6.
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
            : ' — sector no estatal: paga la Filial INSS (Art. 37 DL 56/2021), sin asiento'),
      });
      claims.push({
        leaveId: leave.id,
        units: weeks,
        amount: benefit,
        installment: data.installment,
        rangeStart: data.startDate,
        rangeEnd: data.endDate,
      });
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'Ninguna licencia de maternidad generó prestación en el período. ' +
          warnings.join(' | '),
      );
    }

    return this.savePayrollWithItems(
      companyId,
      'maternidad',
      data,
      items,
      warnings.length ? warnings.join(' | ') : undefined,
      claims,
    );
  }

  /**
   * Prestación social mensual (Art. 30.1 DL 56/2021, mod. DL 71/2023): 60 %
   * de la base de cálculo de la prestación económica —variantes a y b— o del
   * salario promedio mensual del padre o abuelo que asume el cuidado —variante
   * c—, calculado sobre los doce meses anteriores al nacimiento del menor.
   *
   * Corre desde el vencimiento de la licencia posnatal hasta que el menor
   * arribe a su primer año de vida (Art. 8) y su cuantía mensual nunca es
   * inferior al salario mínimo vigente (Art. 9).
   */
  private async generateMaternitySocialBenefit(
    companyId: number,
    data: GenerateInput,
  ) {
    // La ventana de la prestación social se extiende más allá de la licencia,
    // así que no se filtra por solape con el período sino por su propia ventana.
    const leaves = await this.leaveRepo.find({
      where: { companyId, type: 'maternity', status: 'approved' },
    });

    const items: Partial<PayrollItem>[] = [];
    const warnings: string[] = [];
    const claims: LeaveClaim[] = [];
    const periodDays = daysBetween(data.startDate, data.endDate);
    // La prestación es mensual y corre hasta el primer año del menor: el mismo
    // rango de días no puede pagarse dos veces, aunque sea en períodos
    // distintos (rangos personalizados solapados).
    const settledRows = await this.settledLeaveRows(
      companyId,
      leaves.map((l) => l.id),
    );

    for (const leave of leaves) {
      const variant = leave.socialBenefitVariant;
      if (!variant) continue;

      // Sin la fecha del parto no se puede fijar el primer año del menor.
      if (!leave.birthDate) {
        warnings.push(
          `${leave.employeeName}: sin fecha de parto no se fija el fin de la prestación social`,
        );
        continue;
      }

      const socialStart = new Date(leave.endDate);
      socialStart.setDate(socialStart.getDate() + 1);
      const socialEnd = new Date(leave.birthDate);
      socialEnd.setFullYear(socialEnd.getFullYear() + 1);
      socialEnd.setDate(socialEnd.getDate() - 1);
      const windowStart = socialStart.toISOString().split('T')[0];
      const windowEnd = socialEnd.toISOString().split('T')[0];

      const coveredDays = overlapDays(
        windowStart,
        windowEnd,
        data.startDate,
        data.endDate,
      );
      if (coveredDays <= 0) continue;

      if (
        settledRows.some(
          (r) =>
            r.leaveId === leave.id &&
            r.installment === 4 &&
            overlapDays(r.pStart, r.pEnd, data.startDate, data.endDate) > 0,
        )
      ) {
        warnings.push(
          `${leave.employeeName}: la prestación social de ese rango ya fue liquidada`,
        );
        continue;
      }

      // Variante c: cobra el padre o abuelo que asume el cuidado del menor.
      const beneficiaryId =
        variant === 'c' ? leave.beneficiaryEmployeeId : leave.employeeId;
      if (!beneficiaryId) {
        warnings.push(
          `${leave.employeeName}: la variante c exige el beneficiario que asume el cuidado (Art. 30.1.c)`,
        );
        continue;
      }
      const emp = await this.employeeRepo.findOne({
        where: { id: beneficiaryId, companyId },
      });
      if (!emp) {
        warnings.push(`${leave.employeeName}: beneficiario no encontrado`);
        continue;
      }

      // En la variante c la base es lo devengado por el beneficiario en los 12
      // meses anteriores al nacimiento; en a y b, la base de la prestación
      // económica de la madre.
      const referenceDate =
        variant === 'c' ? leave.birthDate : leave.startDate;
      const { average, warning } = await this.averageMonthlySalary(
        companyId,
        emp.id,
        referenceDate,
      );
      if (warning) warnings.push(`${emp.firstName} ${emp.lastName}: ${warning}`);

      // Art. 30.1: 60 %; Art. 9: la cuantía mensual no baja del salario mínimo.
      const monthlyBenefit = Math.max(
        calculateSocialBenefit(average),
        MINIMUM_WAGE,
      );
      const amount = round2((monthlyBenefit * coveredDays) / periodDays);
      if (amount <= 0) continue;

      const isStateSector = emp.employmentSector !== 'non_state';
      items.push({
        ...this.baseItem(emp, companyId),
        grossSalary: amount,
        totalDeductions: 0,
        netSalary: amount,
        leaveRequestId: leave.id,
        averageSalary: average,
        paidUnits: coveredDays,
        appliedRate: SOCIAL_BENEFIT_RATE,
        // En la variante b la madre trabaja y acumula vacaciones por su
        // salario; en a y c el tiempo de prestación cuenta como servicio
        // (Art. 12.1 DL 56/2021) y provisiona aquí.
        ...(variant === 'b'
          ? {}
          : this.vacationAccrual(
              emp,
              overlapWorkingDays(
                windowStart,
                windowEnd,
                data.startDate,
                data.endDate,
              ),
            )),
        notes:
          `Prestación social ${variant} (60 %, Art. 30.1.${variant} DL 56/2021): ` +
          `${coveredDays}/${periodDays} días × ${monthlyBenefit} mensual` +
          (isStateSector
            ? ''
            : ' — sector no estatal: paga la Filial INSS (Art. 37 DL 56/2021), sin asiento'),
      });
      claims.push({
        leaveId: leave.id,
        units: coveredDays,
        amount,
        installment: 4,
        rangeStart: data.startDate,
        rangeEnd: data.endDate,
      });
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'Ninguna licencia de maternidad generó prestación social en el período. ' +
          warnings.join(' | '),
      );
    }

    return this.savePayrollWithItems(
      companyId,
      'maternidad',
      data,
      items,
      warnings.length ? warnings.join(' | ') : undefined,
      claims,
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
    // IIP y CESS sobre el acumulado mensual de todos los conceptos de pago.
    const priorTotals = await monthlyTaxableTotals(
      this.payrollItemRepo,
      companyId,
      data.period,
    );

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

      const { socialSecurity, taxWithholding } = incrementalTaxes(
        priorTotals.get(emp.id),
        gross,
      );
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
