import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('immutable_audit_logs')
@Index('IDX_immutable_audit_logs_tenant_id', ['tenantId'])
@Index('IDX_immutable_audit_logs_category', ['category'])
@Index('IDX_immutable_audit_logs_timestamp', ['timestamp'])
export class ImmutableAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', length: 100, nullable: true })
  tenantId: string;

  @Column({ name: 'category', length: 50 })
  category: string;

  @Column({ name: 'action', length: 100 })
  action: string;

  @Column({ name: 'resource', length: 100, nullable: true })
  resource: string;

  @Column({ type: 'jsonb', nullable: true })
  context: any;

  @Column({ name: 'user_id', length: 100, nullable: true })
  userId: string;

  @Column({ name: 'user_email', length: 255, nullable: true })
  userEmail: string;

  @Column({ name: 'ip_address', length: 50, nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', length: 500, nullable: true })
  userAgent: string;

  @Column({ name: 'entry_hash', length: 128, unique: true })
  entryHash: string;

  @Column({ name: 'previous_hash', length: 128, nullable: true })
  previousHash: string;

  @Column({ name: 'signature', length: 512, nullable: true })
  signature: string;

  @Column({ name: 'sequence_number', type: 'bigint' })
  sequenceNumber: number;

  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;
}
