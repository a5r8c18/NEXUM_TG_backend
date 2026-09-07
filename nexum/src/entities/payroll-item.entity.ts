/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Payroll } from './payroll.entity';
import { CostCenter } from './cost-center.entity';
import type { OccupationalCategory } from '../hr/payroll-concept';

@Entity('payroll_items')
export class PayrollItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => Payroll, (payroll) => payroll.items)
  payroll: Payroll;

  @Column()
  payrollId: number;

  @Column()
  employeeId: string;

  @Column({ type: 'varchar', length: 100 })
  employeeName: string;

  @Column({ type: 'varchar', length: 20 })
  employeeDocument: string;

  @Column({ type: 'varchar', length: 50 })
  position: string;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter: CostCenter | null;

  /**
   * Cuenta de gasto aplicada a esta línea. Se resuelve al generar la nómina y se
   * congela aquí para que el asiento sea reproducible aunque cambie la ficha del
   * trabajador.
   */
  @Column({ name: 'expense_account_code', type: 'varchar', length: 20, nullable: true })
  expenseAccountCode: string | null;

  /** Categoría ocupacional que decide la subcuenta 455-00X0 del neto. */
  @Column({
    name: 'occupational_category',
    type: 'varchar',
    length: 4,
    default: '0020',
  })
  occupationalCategory: OccupationalCategory;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  baseSalary: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  overtimeHours: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  overtimePay: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  bonuses: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  commissions: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowances: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  grossSalary: number;

  // Deductions
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  socialSecurity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  healthInsurance: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pension: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  taxWithholding: number;

  /** Cuotas sindicales retenidas. Se acreditan a la subcuenta 460-0030. */
  @Column({ name: 'union_dues', type: 'decimal', precision: 10, scale: 2, default: 0 })
  unionDues: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  otherDeductions: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDeductions: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  netSalary: number;

  /** Provisión mensual de vacaciones: 1/12 del gasto salarial acumulado del trabajador. */
  @Column({ name: 'vacation_provision', type: 'decimal', precision: 10, scale: 2, default: 0 })
  vacationProvision: number;

  /**
   * Retención del 1,5 % destinada al pago de los subsidios de seguridad social a
   * corto plazo (Art. 46). Es gasto de la empresa con contrapartida en la 500.
   */
  @Column({ name: 'subsidy_retention', type: 'decimal', precision: 10, scale: 2, default: 0 })
  subsidyRetention: number;

  // ── Trazabilidad del cálculo según el concepto ──

  /** Licencia que origina la línea en los conceptos vacaciones, subsidio y maternidad. */
  @Column({ name: 'leave_request_id', type: 'uuid', nullable: true })
  leaveRequestId: string | null;

  /** Salario promedio usado como base del cálculo (Art. 39 subsidio, Art. 16 maternidad). */
  @Column({ name: 'average_salary', type: 'decimal', precision: 15, scale: 2, default: 0 })
  averageSalary: number;

  /** Días o semanas efectivamente pagados tras aplicar carencias y descansos. */
  @Column({ name: 'paid_units', type: 'decimal', precision: 10, scale: 2, default: 0 })
  paidUnits: number;

  /** Porcentaje aplicado sobre la base: 0,50 a 0,80 en subsidio; 0,60 en prestación social. */
  @Column({ name: 'applied_rate', type: 'decimal', precision: 5, scale: 4, default: 0 })
  appliedRate: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'inactive' | 'terminated';

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
