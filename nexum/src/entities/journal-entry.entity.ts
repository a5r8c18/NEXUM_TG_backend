import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Account } from './account.entity';
import { CostCenter } from './cost-center.entity';

export type JournalEntryStatus = 'draft' | 'posted' | 'cancelled';
export type JournalEntryType = 
  | 'manual'
  | 'adjustment'
  | 'opening'
  | 'closing'
  | 'correction';

@Entity('journal_entries')
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'entry_number', length: 50 })
  entryNumber: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'account_code', type: 'varchar', length: 50 })
  accountCode: string;

  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName: string;

  @Column({ name: 'subaccount_code', type: 'varchar', length: 50, nullable: true })
  subaccountCode: string | null;

  @Column({ name: 'subaccount_name', type: 'varchar', length: 255, nullable: true })
  subaccountName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  element: string | null;

  @Column({ name: 'element_description', type: 'varchar', length: 500, nullable: true })
  elementDescription: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  credit: number;

  @Column({ name: 'line_description', type: 'varchar', length: 500, nullable: true })
  lineDescription: string | null;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter: CostCenter;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 30, default: 'manual' })
  type: JournalEntryType;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: JournalEntryStatus;

  @Column({
    name: 'created_by',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  createdBy: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
