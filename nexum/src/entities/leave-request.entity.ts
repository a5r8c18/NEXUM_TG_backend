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

/**
 * 'paternity' registra la ausencia del padre o abuelo que asume el cuidado del
 * menor por cesión de la madre (Art. 30.1.c y 32 DL 56/2021, mod. DL 71/2023);
 * su retribución se genera en la nómina de maternidad con él como beneficiario.
 *
 * 'marriage', 'funeral', 'blood_donation', 'study' y 'other' son licencias
 * retribuidas por la entidad: el día no se descuenta del salario —la empresa
 * lo paga como jornada normal, con todos los tributos y el devengo de
 * vacaciones—; se distinguen por tipo solo para trazabilidad de RRHH.
 */
export type LeaveType =
  | 'vacation'
  | 'sick'
  | 'unpaid'
  | 'maternity'
  | 'paternity'
  | 'marriage'
  | 'funeral'
  | 'blood_donation'
  | 'study'
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

  // ── Licencia de maternidad (DL 56/2021, mod. DL 71/2023) ──

  /** Embarazo múltiple: adelanta el derecho a la semana 32 en vez de la 34 (Art. 6.2 DL 56/2021). */
  @Column({ name: 'multiple_pregnancy', type: 'boolean', default: false })
  multiplePregnancy: boolean;

  /** Fecha real del parto, para los ajustes por adelanto o atraso (Art. 19 DL 56/2021). */
  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ name: 'prenatal_start', type: 'date', nullable: true })
  prenatalStart: string | null;

  @Column({ name: 'postnatal_start', type: 'date', nullable: true })
  postnatalStart: string | null;

  /** Variante de prestación social elegida al vencer la licencia posnatal (Art. 30.1 DL 56/2021). */
  @Column({ name: 'social_benefit_variant', type: 'varchar', length: 1, nullable: true })
  socialBenefitVariant: SocialBenefitVariant | null;

  /**
   * Trabajador que asume el cuidado del menor y cobra la prestación cuando no es
   * la madre: padre, abuelo u otro familiar (Arts. 23-25 y 30.1.c DL 56/2021).
   */
  @Column({ name: 'beneficiary_employee_id', type: 'uuid', nullable: true })
  beneficiaryEmployeeId: string | null;

  // ── Liquidación de la licencia ──

  /**
   * Unidades ya retribuidas por nóminas no canceladas (suma de paid_units de
   * las líneas vinculadas: días en vacaciones, subsidio y prestación social;
   * semanas en los plazos 1-3 de maternidad). Es un acumulado informativo:
   * la garantía contra el doble pago la da la reverificación dentro de la
   * transacción de generación, y al cancelar la nómina se restituyen.
   */
  @Column({ name: 'settled_units', type: 'decimal', precision: 10, scale: 2, default: 0 })
  settledUnits: number;

  /** Importe bruto ya retribuido por la licencia en nóminas no canceladas. */
  @Column({ name: 'settled_amount', type: 'decimal', precision: 15, scale: 2, default: 0 })
  settledAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
