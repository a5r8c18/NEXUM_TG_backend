import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { CashMovement } from './cash-movement.entity';

@Entity('cash_registers')
export class CashRegister {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'register_name', type: 'varchar', length: 100 })
  registerName: string;

  @Column({ name: 'register_code', type: 'varchar', length: 20, unique: true })
  registerCode: string;

  @Column({ name: 'responsible_name', type: 'varchar', length: 200 })
  responsibleName: string;

  @Column({ name: 'responsible_id', type: 'uuid', nullable: true })
  responsibleId: string | null;

  @Column({ name: 'location', type: 'varchar', length: 200, nullable: true })
  location: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'CUP' })
  currency: string;

  @Column({ name: 'current_balance', type: 'decimal', precision: 12, scale: 2, default: 0 })
  currentBalance: number;

  @Column({ name: 'opening_balance', type: 'decimal', precision: 12, scale: 2, default: 0 })
  openingBalance: number;

  @Column({ name: 'max_retention_limit', type: 'decimal', precision: 12, scale: 2, default: 5000 })
  maxRetentionLimit: number;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'closed' })
  status: 'open' | 'closed' | 'suspended';

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'last_opening_date', type: 'timestamp', nullable: true })
  lastOpeningDate: Date | null;

  @Column({ name: 'last_closing_date', type: 'timestamp', nullable: true })
  lastClosingDate: Date | null;

  @Column({ name: 'last_audit_date', type: 'timestamp', nullable: true })
  lastAuditDate: Date | null;

  @Column({ name: 'last_audit_balance', type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastAuditBalance: number | null;

  @Column({ name: 'last_audit_difference', type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastAuditDifference: number | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => CashMovement, (movement) => movement.cashRegister)
  movements: CashMovement[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
