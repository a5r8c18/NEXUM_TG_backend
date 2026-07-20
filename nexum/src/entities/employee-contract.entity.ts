import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ type: 'varchar', length: 30, default: 'full_time' })
  contractType: string; // full_time | part_time | contractor | intern

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
