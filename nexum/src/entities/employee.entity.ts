import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import type {
  ContractTerm,
  EmploymentSector,
  OccupationalCategory,
} from '../hr/payroll-concept';

export type EmployeeStatus = 'active' | 'inactive' | 'on_leave';
export type ContractType = 'trial_period' | 'work_execution';
export type EmployeeActivity = 'direct' | 'indirect';

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

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  /** Cargo del catálogo de plantilla. */
  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId: string | null;

  /** Denominación del cargo, denormalizada para listados e informes. */
  @Column({ type: 'varchar', nullable: true })
  position: string | null;

  @Column({ type: 'varchar', nullable: true })
  departmentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  departmentName: string | null;

  // Enlace opcional a la cuenta de usuario del sistema (login) del empleado.
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'date', nullable: true })
  hireDate: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  salary: number;

  @Column({ type: 'varchar', default: 'work_execution' })
  contractType: ContractType;

  @Column({ name: 'activity', type: 'varchar', length: 20, default: 'direct' })
  activity: EmployeeActivity;

  @Column({ type: 'varchar', default: 'active' })
  status: EmployeeStatus;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  documentId: string | null;

  /**
   * Cuenta de gasto de nómina seleccionada al crear el trabajador. Tiene
   * prioridad sobre la cuenta del centro de costo y sobre los mapeos por tipo.
   */
  @Column({ name: 'expense_account_code', type: 'varchar', length: 20, nullable: true })
  expenseAccountCode: string | null;

  /**
   * Categoría ocupacional del Nomenclador 2016. Determina la subcuenta de
   * Nóminas por Pagar (455-00X0) donde se acredita el neto del trabajador.
   */
  @Column({
    name: 'occupational_category',
    type: 'varchar',
    length: 4,
    default: '0020',
  })
  occupationalCategory: OccupationalCategory;

  /** Sector de empleo: decide quién abona las prestaciones por maternidad. */
  @Column({
    name: 'employment_sector',
    type: 'varchar',
    length: 20,
    default: 'state',
  })
  employmentSector: EmploymentSector;

  /** Modalidad del vínculo laboral: rige los límites de duración del subsidio. */
  @Column({
    name: 'contract_term',
    type: 'varchar',
    length: 20,
    default: 'indeterminate',
  })
  contractTerm: ContractTerm;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
