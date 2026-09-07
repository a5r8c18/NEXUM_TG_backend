/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import type { PayrollConcept } from '../hr/payroll-concept';

@Entity('payrolls')
export class Payroll {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  /**
   * Concepto de la nómina. Cada concepto tiene su propia fórmula de cálculo y su
   * propio juego de líneas contables, por lo que una nómina agrupa un solo
   * concepto para un solo período.
   */
  @Column({ type: 'varchar', length: 20, default: 'salario' })
  concept: PayrollConcept;

  @Column({ type: 'varchar', length: 50 })
  period: string; // e.g., "2026-04"

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalGross: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalDeductions: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalNet: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'processed' | 'paid' | 'cancelled';

  /**
   * Plazo de la prestación económica por maternidad (Art. 18): 1 al inicio de la
   * licencia prenatal, 2 en las seis primeras semanas de la posnatal y 3 en las
   * seis últimas. Nulo en el resto de los conceptos.
   */
  @Column({ type: 'smallint', nullable: true })
  installment?: number | null;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', length: 100 })
  processedBy: string;

  @Column({ type: 'date', nullable: true })
  processedAt?: string;

  @Column({ type: 'date', nullable: true })
  paidAt?: string;

  @OneToMany('PayrollItem', 'payroll')
  items: any[];

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
