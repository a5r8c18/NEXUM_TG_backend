/* eslint-disable prettier/prettier */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('registration_requests')
export class RegistrationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 255 })
  password: string;

  @Column({
    name: 'requested_tenant_type',
    length: 50,
    default: 'SINGLE_COMPANY',
  })
  requestedTenantType: string;

  @Column({ length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 255, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'denied_at', type: 'timestamp', nullable: true })
  deniedAt: Date | null;

  @Column({ name: 'denied_by', type: 'varchar', length: 255, nullable: true })
  deniedBy: string | null;

  @Column({ name: 'denial_reason', type: 'text', nullable: true })
  denialReason: string | null;

  // Additional fields from frontend
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  position: string | null;

  @Column({
    name: 'company_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  companyName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  industry: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ name: 'use_case', type: 'text', nullable: true })
  useCase: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({
    name: 'referral_source',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  referralSource: string | null;

  @Column({ type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({
    name: 'approval_token',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  approvalToken: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
