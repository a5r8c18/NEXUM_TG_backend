/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Payroll } from './payroll.entity';

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

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  otherDeductions: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDeductions: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  netSalary: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'inactive' | 'terminated';

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
