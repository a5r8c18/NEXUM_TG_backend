/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { JobPosition } from '../entities/job-position.entity';
import {
  PayrollConcept,
  TAXABLE_INCOME_CONCEPTS,
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
  async vacationBalances(
    companyId: number,
    period: string,
  ): Promise<Map<string, VacationBalance>> {
    const payrolls = await this.payrollRepo.find({
      where: {
        companyId,
        period: LessThanOrEqual(period),
        // Acumulan el salario y los conceptos que la ley cuenta como días
        // laborados (reposo médico y maternidad); las vacaciones y la
        // liquidación del Art. 52 consumen.
        concept: In([
          'salario',
          'subsidio',
          'maternidad',
          'vacaciones',
          'liquidacion',
        ]),
        status: In(['processed', 'paid']),
      },
      relations: ['items'],
    });

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

    for (const payroll of payrolls) {
      for (const item of payroll.items || []) {
        if (VACATION_FUND_CONCEPTS.includes(payroll.concept)) {
          // Vacaciones disfrutadas y liquidación: consumen días e importe.
          add(
            item.employeeId,
            -Number(item.paidUnits || 0),
            -Number(item.grossSalary || 0),
          );
          continue;
        }
        // Días e importe acumulados por la línea. Las nóminas anteriores a la
        // columna vacation_days no la traen: se deriva de los días pagados.
        const days =
          Number(item.vacationDays || 0) ||
          (Number(item.paidUnits || 0) || WORKING_DAYS_PER_MONTH) *
            VACATION_ACCRUAL_RATE;
        add(item.employeeId, days, Number(item.vacationProvision || 0));
      }
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
    const payrolls = await this.payrollRepo.find({
      where: {
        companyId,
        period: LessThanOrEqual(period),
        concept: In([
          'salario',
          'subsidio',
          'maternidad',
          'vacaciones',
          'liquidacion',
        ]),
        status: In(['processed', 'paid']),
      },
      relations: ['items'],
    });

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

    for (const payroll of payrolls) {
      const inPeriod = payroll.period === period;
      for (const item of payroll.items || []) {
        const b = bucket(item.employeeId);
        if (VACATION_FUND_CONCEPTS.includes(payroll.concept)) {
          // Disfrute y liquidación: consumen días e importe del fondo.
          const days = Number(item.paidUnits || 0);
          const amount = Number(item.grossSalary || 0);
          if (inPeriod) {
            b.settled.days += days;
            b.settled.amount += amount;
          } else {
            b.opening.days -= days;
            b.opening.amount -= amount;
          }
          continue;
        }
        // Acumulado de la línea; las nóminas anteriores a vacation_days lo
        // derivan de los días pagados.
        const days =
          Number(item.vacationDays || 0) ||
          (Number(item.paidUnits || 0) || WORKING_DAYS_PER_MONTH) *
            VACATION_ACCRUAL_RATE;
        const amount = Number(item.vacationProvision || 0);
        if (inPeriod) {
          b.accrued.days += days;
          b.accrued.amount += amount;
        } else {
          b.opening.days += days;
          b.opening.amount += amount;
        }
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
   * Fichero de acreditación: por trabajador, CI, nombre, banco, cuenta e
   * importe a acreditar, agregando el neto de TODAS las nóminas del período
   * —salario, vacaciones, subsidio, maternidad, liquidación y libre— porque
   * el banco acredita el total del mes. La maternidad del sector no estatal
   * la paga la Filial INSS (Art. 37 DL 56/2021): no sale por el banco de la
   * empresa y se excluye del fichero.
   */
  async accreditationFile(
    companyId: number,
    period: string,
  ): Promise<AccreditationRow[]> {
    const payrolls = await this.payrollRepo.find({
      where: {
        companyId,
        period,
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
    for (const { item, concept } of items) {
      const emp = empById.get(item.employeeId);
      // Maternidad del sector no estatal: la paga la Filial INSS.
      if (
        concept === 'maternidad' &&
        (emp?.employmentSector || 'state') === 'non_state'
      ) {
        continue;
      }
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
