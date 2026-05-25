import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { BankAccount } from './bank-account.entity';

export type ReconciliationStatus = 'draft' | 'completed';

@Entity('bank_reconciliations')
export class BankReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'bank_account_id', type: 'uuid' })
  bankAccountId: string;

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount;

  @Column({ name: 'reconciliation_date', type: 'date' })
  reconciliationDate: string;

  @Column({ name: 'statement_balance', type: 'decimal', precision: 15, scale: 2 })
  statementBalance: number;

  @Column({ name: 'book_balance', type: 'decimal', precision: 15, scale: 2 })
  bookBalance: number;

  @Column({ name: 'adjusted_statement_balance', type: 'decimal', precision: 15, scale: 2, default: 0 })
  adjustedStatementBalance: number;

  @Column({ name: 'adjusted_book_balance', type: 'decimal', precision: 15, scale: 2, default: 0 })
  adjustedBookBalance: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  difference: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ReconciliationStatus;

  @Column({ name: 'deposits_in_transit', type: 'decimal', precision: 15, scale: 2, default: 0 })
  depositsInTransit: number;

  @Column({ name: 'outstanding_checks', type: 'decimal', precision: 15, scale: 2, default: 0 })
  outstandingChecks: number;

  @Column({ name: 'bank_charges', type: 'decimal', precision: 15, scale: 2, default: 0 })
  bankCharges: number;

  @Column({ name: 'interest_earned', type: 'decimal', precision: 15, scale: 2, default: 0 })
  interestEarned: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'reconciled_by', type: 'varchar', length: 255, nullable: true })
  reconciledBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
