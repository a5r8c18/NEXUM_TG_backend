/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { JobPosition } from '../entities/job-position.entity';
import {
  VACATION_ACCRUAL_RATE,
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
  accumulatedDays: number;
  accumulatedAmount: number;
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
        concept: In(['salario', 'vacaciones']),
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

    for (const payroll of payrolls) {
      for (const item of payroll.items || []) {
        if (payroll.concept === 'salario') {
          // Días acumulados: 9,09 % de los días efectivamente laborados
          // (2,18 por cada 24). El importe es la provisión ya contabilizada.
          const paidDays =
            Number(item.paidUnits || 0) || WORKING_DAYS_PER_MONTH;
          add(
            item.employeeId,
            paidDays * VACATION_ACCRUAL_RATE,
            Number(item.vacationProvision || 0),
          );
        } else {
          // Vacaciones disfrutadas: consumen días e importe del acumulado.
          add(
            item.employeeId,
            -Number(item.paidUnits || 0),
            -Number(item.grossSalary || 0),
          );
        }
      }
    }
    return balances;
  }

  /** Submayor de vacaciones: el saldo acumulado, con los datos del trabajador. */
  async vacationSubmayor(
    companyId: number,
    period: string,
  ): Promise<VacationSubmayorRow[]> {
    const balances = await this.vacationBalances(companyId, period);
    if (balances.size === 0) return [];

    const employees = await this.employeeRepo.find({
      where: { companyId, id: In([...balances.keys()]) },
    });
    const empById = new Map(employees.map((e) => [e.id, e]));

    return [...balances.entries()]
      .map(([employeeId, acc]) => {
        const emp = empById.get(employeeId);
        return {
          employeeName: emp
            ? `${emp.firstName} ${emp.lastName}`.trim()
            : 'Trabajador no encontrado',
          documentId: emp?.documentId || null,
          accumulatedDays: Math.round(acc.days * 100) / 100,
          accumulatedAmount: Math.round(acc.amount * 100) / 100,
        };
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }

  /** Nóminas de salario ya liquidadas del período. */
  private async salaryPayrolls(
    companyId: number,
    period: string,
  ): Promise<Payroll[]> {
    return this.payrollRepo.find({
      where: {
        companyId,
        period,
        concept: 'salario',
        status: In(['processed', 'paid']),
      },
      relations: ['items'],
    });
  }

  /**
   * Salario devengado (CNC): por trabajador, el devengado, la contribución
   * especial a la seguridad social (5 %), el impuesto sobre ingresos y el
   * neto a pagar, tomados de las líneas de la nómina de salario procesada.
   */
  async payrollCnc(
    companyId: number,
    period: string,
  ): Promise<PayrollCncRow[]> {
    const payrolls = await this.salaryPayrolls(companyId, period);
    return payrolls
      .flatMap((p) => p.items || [])
      .map((i: PayrollItem) => ({
        employeeName: i.employeeName,
        grossSalary: Number(i.grossSalary || 0),
        socialSecurity: Number(i.socialSecurity || 0),
        taxWithholding: Number(i.taxWithholding || 0),
        netSalary: Number(i.netSalary || 0),
      }));
  }

  /**
   * Fichero de acreditación salarial: por trabajador, CI, nombre, banco,
   * cuenta e importe a acreditar (neto de la nómina de salario procesada).
   */
  async accreditationFile(
    companyId: number,
    period: string,
  ): Promise<AccreditationRow[]> {
    const payrolls = await this.salaryPayrolls(companyId, period);
    const items = payrolls.flatMap((p) => p.items || []);
    if (items.length === 0) return [];

    // Banco y cuenta viven en la ficha del trabajador, no en la línea de nómina.
    const employees = await this.employeeRepo.find({
      where: { companyId, id: In([...new Set(items.map((i) => i.employeeId))]) },
    });
    const empById = new Map(employees.map((e) => [e.id, e]));

    return items.map((i: PayrollItem) => {
      const emp = empById.get(i.employeeId);
      return {
        documentId: i.employeeDocument || emp?.documentId || null,
        employeeName: i.employeeName,
        bankName: emp?.bankName || null,
        bankAccount: emp?.bankAccount || null,
        amount: Number(i.netSalary || 0),
      };
    });
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
