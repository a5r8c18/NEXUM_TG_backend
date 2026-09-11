import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Cargo o plaza de la plantilla. Centraliza la denominación del puesto y su
 * salario de referencia, de modo que las fichas de trabajador y los contratos
 * dejen de escribir el cargo como texto libre.
 */
@Entity('job_positions')
@Index('UQ_job_positions_company_name', ['companyId', 'name'], { unique: true })
export class JobPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /** Salario de referencia del cargo. Se propone al asignarlo y es ajustable. */
  @Column({ name: 'base_salary', type: 'decimal', precision: 15, scale: 2, default: 0 })
  baseSalary: number;

  /** Jornada laboral en horas. */
  @Column({ name: 'working_hours', type: 'decimal', precision: 5, scale: 2, default: 8 })
  workingHours: number;

  /** Fondo de tiempo (horas o días) que cubre el salario base. */
  @Column({ name: 'time_bank', type: 'decimal', precision: 10, scale: 2, default: 0 })
  timeBank: number;

  /** Unidad del fondo de tiempo: 'hours' o 'days'. */
  @Column({ name: 'time_unit', type: 'varchar', length: 10, default: 'hours' })
  timeUnit: 'hours' | 'days';

  /** Tasa salarial (baseSalary / timeBank) para cálculos de pago. */
  @Column({ name: 'salary_rate', type: 'decimal', precision: 15, scale: 4, default: 0 })
  salaryRate: number;

  /** Concepto de pago asociado al cargo. */
  @Column({ name: 'payment_concept', type: 'varchar', length: 255, nullable: true })
  paymentConcept: string | null;

  /** Departamento al que pertenece la plaza, si la plantilla lo distingue. */
  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'department_name', type: 'varchar', length: 150, nullable: true })
  departmentName: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  /** Calculado en consulta; no se persiste. */
  employeeCount?: number;
}
