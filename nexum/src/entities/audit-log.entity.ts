import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE', 
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  READ = 'READ',
  EXPORT = 'EXPORT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  TRANSFER = 'TRANSFER',
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
  RETURN = 'RETURN'
}

export enum AuditResource {
  USER = 'USER',
  COMPANY = 'COMPANY',
  INVOICE = 'INVOICE',
  PURCHASE = 'PURCHASE',
  INVENTORY = 'INVENTORY',
  MOVEMENT = 'MOVEMENT',
  WAREHOUSE = 'WAREHOUSE',
  REPORT = 'REPORT',
  FIXED_ASSET = 'FIXED_ASSET',
  AUTH = 'AUTH',
  SYSTEM = 'SYSTEM'
}

@Entity('audit_logs')
@Index('IDX_audit_company_id', ['companyId'])
@Index('IDX_audit_user_id', ['userId'])
@Index('IDX_audit_action', ['action'])
@Index('IDX_audit_created_at', ['createdAt'])
@Index('IDX_audit_resource', ['resource'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: number | null;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @Column({ name: 'user_id', type: 'varchar', length: 255, nullable: true })
  userId: string | null;

  @Column({ name: 'user_name', type: 'varchar', length: 255, nullable: true })
  userName: string | null;

  @Column({ name: 'user_email', type: 'varchar', length: 255, nullable: true })
  userEmail: string | null;

  @Column({ name: 'user_role', type: 'varchar', length: 50, nullable: true })
  userRole: string | null;

  @Column({
    name: 'action',
    length: 20,
    type: 'varchar',
  })
  action: AuditAction;

  @Column({
    name: 'resource',
    length: 50,
    type: 'varchar',
  })
  resource: AuditResource;

  @Column({ name: 'resource_id', type: 'varchar', length: 255, nullable: true })
  resourceId: string | null;

  @Column({ name: 'resource_name', type: 'varchar', length: 255, nullable: true })
  resourceName: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'endpoint', type: 'varchar', length: 255, nullable: true })
  endpoint: string | null;

  @Column({ name: 'method', type: 'varchar', length: 10, nullable: true })
  method: string | null;

  @Column({ name: 'old_values', type: 'json', nullable: true })
  oldValues: Record<string, any> | null;

  @Column({ name: 'new_values', type: 'json', nullable: true })
  newValues: Record<string, any> | null;

  @Column({ name: 'success', type: 'boolean', default: true })
  success: boolean;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
