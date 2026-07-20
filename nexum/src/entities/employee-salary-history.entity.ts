import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Historial de cambios salariales de un empleado.
 * Se registra automáticamente cada vez que cambia el salario del empleado,
 * conservando el valor anterior y el nuevo para trazabilidad y auditoría.
 */
@Entity('employee_salary_history')
@Index('IDX_salary_history_employee', ['employeeId'])
export class EmployeeSalaryHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

  @Column({ type: 'uuid' })
  employeeId: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  previousSalary: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  newSalary: number;

  @Column({ type: 'date' })
  effectiveDate: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  changedBy: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
