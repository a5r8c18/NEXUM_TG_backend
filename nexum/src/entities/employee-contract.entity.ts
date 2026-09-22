import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ContractTerm } from '../hr/payroll-concept';
import type { ContractType } from './employee.entity';

export type ContractStatus = 'active' | 'expired' | 'terminated' | 'suspended';

@Entity('employee_contracts')
export class EmployeeContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

  @Column({ type: 'uuid' })
  employeeId: string;

  @Column({ type: 'varchar', length: 150 })
  employeeName: string;

  /** Modalidad del contrato (Ley 116): ordinario, a prueba o ejecución de obra. */
  @Column({ type: 'varchar', length: 30, default: 'ordinary' })
  contractType: ContractType;

  /**
   * Duración del vínculo (Art. 24 Ley 116): determinado o indeterminado.
   * Gobierna los límites de duración del subsidio (Arts. 43 y 45).
   */
  @Column({
    name: 'contract_term',
    type: 'varchar',
    length: 20,
    default: 'indeterminate',
  })
  contractTerm: ContractTerm;

  /** Cargo del catálogo de plantilla. */
  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId: string | null;

  /** Denominación del cargo, denormalizada para listados e informes. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  position: string | null;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string | null; // null = indefinido

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  salary: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: ContractStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  documentUrl: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
