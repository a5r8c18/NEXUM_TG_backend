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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
