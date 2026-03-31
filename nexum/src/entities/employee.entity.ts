import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type EmployeeStatus = 'active' | 'inactive' | 'on_leave';
export type ContractType = 'full_time' | 'part_time' | 'contractor' | 'intern';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

  @Column()
  employeeCode: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  position: string | null;

  @Column({ type: 'varchar', nullable: true })
  departmentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  departmentName: string | null;

  @Column({ type: 'date', nullable: true })
  hireDate: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  salary: number;

  @Column({ type: 'varchar', default: 'full_time' })
  contractType: ContractType;

  @Column({ type: 'varchar', default: 'active' })
  status: EmployeeStatus;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  documentId: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
