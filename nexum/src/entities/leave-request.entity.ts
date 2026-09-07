import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  IncapacityOrigin,
  SocialBenefitVariant,
} from '../hr/payroll-concept';

export type LeaveType =
  | 'vacation'
  | 'sick'
  | 'unpaid'
  | 'maternity'
  | 'paternity'
  | 'other';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

  @Column({ type: 'uuid' })
  employeeId: string;

  @Column({ type: 'varchar', length: 150 })
  employeeName: string;

  @Column({ type: 'varchar', length: 20, default: 'vacation' })
  type: LeaveType;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'integer', default: 0 })
  days: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: LeaveStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  approvedBy: string | null;

  @Column({ type: 'date', nullable: true })
  approvedAt: string | null;

  // ── Subsidio por enfermedad o accidente (Art. 39-46) ──

  /**
   * Origen de la incapacidad. Determina el porcentaje del subsidio (Art. 40) y
   * los días de carencia antes de iniciar el pago (Art. 42).
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  origin: IncapacityOrigin | null;

  /** Si el trabajador está hospitalizado (Art. 40 y 42.b). */
  @Column({ type: 'boolean', default: false })
  hospitalized: boolean;

  /**
   * Fecha de ingreso hospitalario. Cuando existe, el subsidio se paga desde ese
   * momento sin días de carencia (Art. 42.b).
   */
  @Column({ name: 'hospitalization_start', type: 'date', nullable: true })
  hospitalizationStart: string | null;

  /**
   * Certificado médico que justifica la incapacidad. Su ausencia suspende el
   * pago del subsidio (Art. 46).
   */
  @Column({ name: 'medical_certificate', type: 'varchar', length: 100, nullable: true })
  medicalCertificate: string | null;

  // ── Licencia de maternidad (Art. 15-38) ──

  /** Embarazo múltiple: adelanta el derecho a la semana 32 en vez de la 34 (Art. 20). */
  @Column({ name: 'multiple_pregnancy', type: 'boolean', default: false })
  multiplePregnancy: boolean;

  /** Fecha real del parto, para los ajustes por adelanto o atraso (Art. 19). */
  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ name: 'prenatal_start', type: 'date', nullable: true })
  prenatalStart: string | null;

  @Column({ name: 'postnatal_start', type: 'date', nullable: true })
  postnatalStart: string | null;

  /** Variante de prestación social elegida al vencer la licencia posnatal (Art. 30.1). */
  @Column({ name: 'social_benefit_variant', type: 'varchar', length: 1, nullable: true })
  socialBenefitVariant: SocialBenefitVariant | null;

  /**
   * Trabajador que asume el cuidado del menor y cobra la prestación cuando no es
   * la madre: padre, abuelo u otro familiar (Art. 23-25 y 30.1.c).
   */
  @Column({ name: 'beneficiary_employee_id', type: 'uuid', nullable: true })
  beneficiaryEmployeeId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
