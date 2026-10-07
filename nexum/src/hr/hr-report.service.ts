/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { JobPosition } from '../entities/job-position.entity';
import { buildAccreditationDbf } from './accreditation-dbf';
import { round2 } from './payroll-calculations';
import {
  PayrollConcept,
  EMPLOYER_SOCIAL_SECURITY_RATE,
  EMPLOYER_TAX_CONCEPTS,
  LABOR_FORCE_TAX_RATE,
  TAXABLE_INCOME_CONCEPTS,
  TIME_SUPPLEMENT_CONCEPTS,
  VACATION_ACCRUAL_RATE,
  VACATION_FUND_CONCEPTS,
  WORKING_DAYS_PER_MONTH,
} from './payroll-concept';

/** Saldo acumulado de vacaciones de un trabajador: días e importe. */
export interface VacationBalance {
  days: number;
  amount: number;
}

export interface VacationSubmayorRow {
  employeeName: string;
  documentId: string | null;
  /** Saldo al inicio del período (días e importe). */
  openingDays: number;
  openingAmount: number;
  /** Devengado en el período: provisión del Art. 102 (salario, subsidio, maternidad). */
  accruedDays: number;
  accruedAmount: number;
  /** Liquidado en el período: disfrute y liquidación por terminación (Art. 52). */
  settledDays: number;
  settledAmount: number;
  /** Saldo al cierre del período: inicial + devengado − liquidado. */
  closingDays: number;
  closingAmount: number;
}

export interface PayrollCncRow {
  employeeName: string;
  grossSalary: number;
  socialSecurity: number;
  taxWithholding: number;
  netSalary: number;
}

export interface EmployerTaxesRow {
  employeeName: string;
  documentId: string | null;
  grossSalary: number;
  employerSocialSecurity: number;
  laborForceTax: number;
  totalEmployerTaxes: number;
}

export interface AccreditationRow {
  documentId: string | null;
  employeeName: string;
  bankName: string | null;
  bankAccount: string | null;
  amount: number;
}

export interface StaffingRow {
  positionName: string;
  departmentName: string | null;
  approved: number;
  covered: number;
  vacant: number;
  baseSalary: number;
}

/** Movimiento del fondo de vacaciones: solo las columnas que el cálculo usa. */
interface VacationMovement {
  concept: PayrollConcept;
  period: string;
  employeeId: string;
  paidUnits: number;
  grossSalary: number;
  vacationDays: number;
  vacationProvision: number;
}

/** Conceptos que acumulan o consumen el fondo de vacaciones (cuenta 492). */
const VACATION_MOVEMENT_CONCEPTS: PayrollConcept[] = [
  'salario',
  'subsidio',
  'maternidad',
  ...TIME_SUPPLEMENT_CONCEPTS,
  'vacaciones',
  'liquidacion',
];

/**
 * Días acumulados por una línea. Las nóminas anteriores a la columna
 * vacation_days no la traen y se derivan de los días pagados; los pagos
 * adicionales por horas acumulan solo importe, nunca días.
 */
function accruedDaysOf(mov: VacationMovement): number {
  if (mov.vacationDays || TIME_SUPPLEMENT_CONCEPTS.includes(mov.concept)) {
    return mov.vacationDays;
  }
  return (mov.paidUnits || WORKING_DAYS_PER_MONTH) * VACATION_ACCRUAL_RATE;
}

@Injectable()
export class HrReportService {
  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepo: Repository<Payroll>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(JobPosition)
    private readonly positionRepo: Repository<JobPosition>,
  ) {}

  /**
   * Saldo acumulado de vacaciones por trabajador hasta el período, según el
   * Art. 102 de la Ley 116 (9,09 % de los días laborados y de los salarios
   * percibidos).
   *
   * Acredita lo provisionado en las nóminas de salario contabilizadas —el
   * importe es el mismo que se acredita a la cuenta 492, de modo que el
   * submayor cuadra con el mayor— y debita el bruto de las nóminas de
   * vacaciones pagadas, que es lo que consume la provisión.
   *
   * Se deriva de las nóminas en lugar de guardarse: si una se anula o se
   * edita, el saldo se corrige solo.
   */
  /**
   * Movimientos del fondo de vacaciones hasta el período, por proyección de
   * columnas en vez de `relations: ['items']`.
   *
   * El saldo depende de todo el histórico de nóminas, así que hidratar cada
   * nómina con todas sus líneas completas crecía sin techo: una empresa con
   * cinco años de operación cargaba en memoria decenas de miles de entidades
   * para calcular un saldo que solo necesita cuatro columnas por línea.
   *
   * Acumulan el salario y los conceptos que la ley cuenta como días laborados
   * (reposo médico, maternidad y el propio disfrute de vacaciones); la
   * liquidación del Art. 52 solo consume.
   */
  private async vacationMovements(
    companyId: number,
    period: string,
  ): Promise<VacationMovement[]> {
    const rows = await this.payrollRepo
      .createQueryBuilder('p')
      .innerJoin('p.items', 'i')
      .select('p.concept', 'concept')
      .addSelect('p.period', 'period')
      .addSelect('i.employeeId', 'employeeId')
      .addSelect('i.paidUnits', 'paidUnits')
      .addSelect('i.grossSalary', 'grossSalary')
      .addSelect('i.vacationDays', 'vacationDays')
      .addSelect('i.vacationProvision', 'vacationProvision')
      .where('p.companyId = :companyId', { companyId })
      .andWhere('p.period <= :period', { period })
      .andWhere('p.concept IN (:...concepts)', {
        concepts: VACATION_MOVEMENT_CONCEPTS,
      })
      .andWhere('p.status IN (:...statuses)', {
        statuses: ['processed', 'paid'],
      })
      .getRawMany<Record<string, string | null>>();

    return rows.map((r) => ({
      concept: r.concept as PayrollConcept,
      period: String(r.period),
      employeeId: String(r.employeeId),
      paidUnits: Number(r.paidUnits || 0),
      grossSalary: Number(r.grossSalary || 0),
      vacationDays: Number(r.vacationDays || 0),
      vacationProvision: Number(r.vacationProvision || 0),
    }));
  }

  async vacationBalances(
    companyId: number,
    period: string,
  ): Promise<Map<string, VacationBalance>> {
    const movements = await this.vacationMovements(companyId, period);

    const balances = new Map<string, VacationBalance>();
    const add = (id: string, days: number, amount: number) => {
      const acc = balances.get(id) || { days: 0, amount: 0 };
      acc.days += days;
      acc.amount += amount;
      balances.set(id, acc);
    };

    // Saldo de apertura: lo que cada trabajador traía acumulado antes de la
    // primera nómina del sistema.
    const employees = await this.employeeRepo.find({ where: { companyId } });
    for (const emp of employees) {
      const days = Number(emp.initialVacationDays || 0);
      const amount = Number(emp.initialVacationAmount || 0);
      if (days > 0 || amount > 0) add(emp.id, days, amount);
    }

    for (const mov of movements) {
      if (VACATION_FUND_CONCEPTS.includes(mov.concept)) {
        // Vacaciones disfrutadas y liquidación: consumen días e importe.
        add(mov.employeeId, -mov.paidUnits, -mov.grossSalary);
        if (mov.concept === 'vacaciones') {
          // El disfrute también acumula (Art. 102): se acredita lo que la
          // línea provisionó, con los valores guardados — las nóminas
          // anteriores a la acumulación en vacaciones traen 0 y no generan
          // días fantasma.
          add(mov.employeeId, mov.vacationDays, mov.vacationProvision);
        }
        continue;
      }
      add(mov.employeeId, accruedDaysOf(mov), mov.vacationProvision);
    }
    return balances;
  }

  /**
   * Submayor de vacaciones del período: por trabajador, el saldo al inicio,
   * lo devengado y lo liquidado en el mes, y el saldo al cierre. Es el libro
   * auxiliar de la 492: la desagrega por persona y permite cruzarla con el
   * mayor (el saldo final consolidado es su saldo acreedor).
   *
   * Un saldo final negativo es un adelanto de vacaciones: el trabajador
   * disfrutó más de lo que tenía acumulado y la 492 quedó en débito.
   */
  async vacationSubmayor(
    companyId: number,
    period: string,
  ): Promise<VacationSubmayorRow[]> {
    const movements = await this.vacationMovements(companyId, period);

    interface Buckets {
      opening: VacationBalance;
      accrued: VacationBalance;
      settled: VacationBalance;
    }
    const rows = new Map<string, Buckets>();
    const bucket = (id: string): Buckets => {
      const b = rows.get(id) || {
        opening: { days: 0, amount: 0 },
        accrued: { days: 0, amount: 0 },
        settled: { days: 0, amount: 0 },
      };
      rows.set(id, b);
      return b;
    };

    // El saldo de apertura del sistema integra el saldo inicial del período.
    const employees = await this.employeeRepo.find({ where: { companyId } });
    for (const emp of employees) {
      const days = Number(emp.initialVacationDays || 0);
      const amount = Number(emp.initialVacationAmount || 0);
      if (days !== 0 || amount !== 0) {
        const b = bucket(emp.id);
        b.opening.days += days;
        b.opening.amount += amount;
      }
    }

    for (const mov of movements) {
      const inPeriod = mov.period === period;
      const b = bucket(mov.employeeId);
      if (VACATION_FUND_CONCEPTS.includes(mov.concept)) {
        // Disfrute y liquidación: consumen días e importe del fondo.
        if (inPeriod) {
          b.settled.days += mov.paidUnits;
          b.settled.amount += mov.grossSalary;
        } else {
          b.opening.days -= mov.paidUnits;
          b.opening.amount -= mov.grossSalary;
        }
        if (mov.concept === 'vacaciones') {
          // El disfrute también acumula (Art. 102): lo provisionado por la
          // línea se devenga en su período o integra el saldo de apertura.
          const acc = inPeriod ? b.accrued : b.opening;
          acc.days += mov.vacationDays;
          acc.amount += mov.vacationProvision;
        }
        continue;
      }
      const days = accruedDaysOf(mov);
      if (inPeriod) {
        b.accrued.days += days;
        b.accrued.amount += mov.vacationProvision;
      } else {
        b.opening.days += days;
        b.opening.amount += mov.vacationProvision;
      }
    }

    const empById = new Map(employees.map((e) => [e.id, e]));
    const r2 = (v: number) => Math.round(v * 100) / 100;

    return [...rows.entries()]
      .map(([employeeId, b]) => {
        const emp = empById.get(employeeId);
        return {
          employeeName: emp
            ? `${emp.firstName} ${emp.lastName}`.trim()
            : 'Trabajador no encontrado',
          documentId: emp?.documentId || null,
          openingDays: r2(b.opening.days),
          openingAmount: r2(b.opening.amount),
          accruedDays: r2(b.accrued.days),
          accruedAmount: r2(b.accrued.amount),
          settledDays: r2(b.settled.days),
          settledAmount: r2(b.settled.amount),
          closingDays: r2(b.opening.days + b.accrued.days - b.settled.days),
          closingAmount: r2(
            b.opening.amount + b.accrued.amount - b.settled.amount,
          ),
        };
      })
      // Solo cuentas con saldo o movimiento: un trabajador con todo en cero
      // no aporta al submayor.
      .filter(
        (r) =>
          r.openingDays !== 0 ||
          r.openingAmount !== 0 ||
          r.accruedDays !== 0 ||
          r.accruedAmount !== 0 ||
          r.settledDays !== 0 ||
          r.settledAmount !== 0 ||
          r.closingDays !== 0 ||
          r.closingAmount !== 0,
      )
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }

  /** Nóminas liquidadas del período de los conceptos indicados. */
  private async periodPayrolls(
    companyId: number,
    period: string,
    concepts: PayrollConcept[],
  ): Promise<Payroll[]> {
    return this.payrollRepo.find({
      where: {
        companyId,
        period,
        concept: In(concepts),
        status: In(['processed', 'paid']),
      },
      relations: ['items'],
    });
  }

  /**
   * Salario devengado (CNC): por trabajador, el devengado, la contribución
   * especial a la seguridad social, el impuesto sobre ingresos y el neto,
   * agregados sobre TODOS los conceptos de pago gravables del período —la
   * Res. 41/2023 grava "todos los conceptos de pago; incluyendo el pago por
   * descanso retribuido"—. El subsidio y la maternidad son prestaciones
   * sociales exentas y no forman parte de esta declaración.
   */
  async payrollCnc(
    companyId: number,
    period: string,
  ): Promise<PayrollCncRow[]> {
    const payrolls = await this.periodPayrolls(
      companyId,
      period,
      TAXABLE_INCOME_CONCEPTS,
    );
    const rows = new Map<string, PayrollCncRow>();
    for (const payroll of payrolls) {
      for (const i of payroll.items || []) {
        const row = rows.get(i.employeeId) || {
          employeeName: i.employeeName,
          grossSalary: 0,
          socialSecurity: 0,
          taxWithholding: 0,
          netSalary: 0,
        };
        row.grossSalary += Number(i.grossSalary || 0);
        row.socialSecurity += Number(i.socialSecurity || 0);
        row.taxWithholding += Number(i.taxWithholding || 0);
        row.netSalary += Number(i.netSalary || 0);
        rows.set(i.employeeId, row);
      }
    }
    return [...rows.values()];
  }

  /**
   * Impuestos empresariales (aporte patronal 14 % y uso de fuerza de trabajo
   * 5 %) descontados por trabajador en el período. Se suman los importes de
   * todas las nóminas cuyo concepto genera estos tributos.
   */
  async employerTaxesReport(
    companyId: number,
    period: string,
  ): Promise<EmployerTaxesRow[]> {
    const payrolls = await this.periodPayrolls(
      companyId,
      period,
      EMPLOYER_TAX_CONCEPTS,
    );
    const rows = new Map<string, EmployerTaxesRow>();
    for (const payroll of payrolls) {
      for (const i of payroll.items || []) {
        const gross = Number(i.grossSalary || 0);
        const row = rows.get(i.employeeId) || {
          employeeName: i.employeeName,
          documentId: i.employeeDocument || null,
          grossSalary: 0,
          employerSocialSecurity: 0,
          laborForceTax: 0,
          totalEmployerTaxes: 0,
        };
        row.grossSalary += gross;
        row.employerSocialSecurity += round2(gross * EMPLOYER_SOCIAL_SECURITY_RATE);
        row.laborForceTax += round2(gross * LABOR_FORCE_TAX_RATE);
        row.totalEmployerTaxes =
          round2(row.employerSocialSecurity + row.laborForceTax);
        rows.set(i.employeeId, row);
      }
    }
    return [...rows.values()].filter((r) => r.grossSalary > 0);
  }

  /**
   * Fichero de acreditación: por trabajador, CI, nombre, banco, cuenta e
   * importe a acreditar, agregando el neto de TODAS las nóminas del período
   * —salario, vacaciones, subsidio, maternidad, liquidación y libre— porque
   * el banco acredita el total del mes.
   */
  async accreditationFile(
    companyId: number,
    period: string,
    payrollId?: number,
  ): Promise<AccreditationRow[]> {
    const payrolls = await this.payrollRepo.find({
      where: {
        companyId,
        ...(payrollId ? { id: payrollId } : { period }),
        status: In(['processed', 'paid']),
      },
      relations: ['items'],
    });
    const items = payrolls.flatMap((p) =>
      (p.items || []).map((i) => ({ item: i, concept: p.concept || 'salario' })),
    );
    if (items.length === 0) return [];

    // Banco y cuenta viven en la ficha del trabajador, no en la línea de nómina.
    const employees = await this.employeeRepo.find({
      where: {
        companyId,
        id: In([...new Set(items.map(({ item }) => item.employeeId))]),
      },
    });
    const empById = new Map(employees.map((e) => [e.id, e]));

    const rows = new Map<string, AccreditationRow>();
    for (const { item } of items) {
      const emp = empById.get(item.employeeId);
      const row = rows.get(item.employeeId) || {
        documentId: item.employeeDocument || emp?.documentId || null,
        employeeName: item.employeeName,
        bankName: emp?.bankName || null,
        bankAccount: emp?.bankAccount || null,
        amount: 0,
      };
      row.amount += Number(item.netSalary || 0);
      rows.set(item.employeeId, row);
    }
    return [...rows.values()].filter((r) => r.amount > 0);
  }

  /**
   * Fichero de acreditación en el DBF del banco. Solo entran los
   * trabajadores con CI y cuenta: el resto se informa para que se completen
   * sus fichas, porque el banco rechazaría el registro.
   */
  async accreditationDbf(
    companyId: number,
    period: string,
    payrollId?: number,
  ): Promise<{ file: Buffer; omitted: string[] }> {
    const rows = await this.accreditationFile(companyId, period, payrollId);
    const valid = rows.filter((r) => r.documentId && r.bankAccount);
    const omitted = rows
      .filter((r) => !r.documentId || !r.bankAccount)
      .map((r) => r.employeeName);
    const file = buildAccreditationDbf(
      valid.map((r) => ({
        documentId: String(r.documentId).trim(),
        bankAccount: String(r.bankAccount).replace(/\s+/g, ''),
        amount: Math.round(r.amount * 100) / 100,
      })),
    );
    return { file, omitted };
  }

  /**
   * Plantilla aprobada y cubierta: plazas aprobadas por cargo frente a los
   * trabajadores activos que las ocupan. Las vacantes son la diferencia.
   */
  async staffingReport(companyId: number): Promise<StaffingRow[]> {
    const positions = await this.positionRepo.find({
      where: { companyId, isActive: true },
    });
    const counts = await this.employeeRepo
      .createQueryBuilder('e')
      .select('e.positionId', 'positionId')
      .addSelect('COUNT(e.id)', 'covered')
      .where('e.companyId = :companyId', { companyId })
      .andWhere("e.status = 'active'")
      .andWhere('e.positionId IS NOT NULL')
      .groupBy('e.positionId')
      .getRawMany();
    const coveredByPosition = new Map<string, number>(
      counts.map((r) => [r.positionId as string, Number(r.covered)]),
    );

    return positions
      .map((p) => {
        const approved = Number(p.approvedCount || 0);
        const covered = coveredByPosition.get(p.id) || 0;
        return {
          positionName: p.name,
          departmentName: p.departmentName,
          approved,
          covered,
          vacant: Math.max(0, approved - covered),
          baseSalary: Number(p.baseSalary || 0),
        };
      })
      .sort((a, b) => a.positionName.localeCompare(b.positionName));
  }
}
