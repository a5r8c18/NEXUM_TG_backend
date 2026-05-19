import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { BankAccount } from './bank-account.entity';

@Entity('bank_transactions')
export class BankTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_number', type: 'varchar', length: 50, unique: true })
  transactionNumber: string;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  @Column({ name: 'transaction_type', type: 'varchar', length: 20 })
  transactionType: 'debit' | 'credit' | 'transfer_in' | 'transfer_out' | 'fee' | 'interest' | 'penalty';

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'CUP' })
  currency: string;

  @Column({ name: 'exchange_rate', type: 'decimal', precision: 8, scale: 4, default: 1 })
  exchangeRate: number;

  @Column({ name: 'description', type: 'varchar', length: 200 })
  description: string;

  @Column({ name: 'reference_number', type: 'varchar', length: 50, nullable: true })
  referenceNumber: string | null;

  @Column({ name: 'counterparty_name', type: 'varchar', length: 200, nullable: true })
  counterpartyName: string | null;

  @Column({ name: 'counterparty_account', type: 'varchar', length: 50, nullable: true })
  counterpartyAccount: string | null;

  @Column({ name: 'counterparty_bank', type: 'varchar', length: 100, nullable: true })
  counterpartyBank: string | null;

  @Column({ name: 'transaction_code', type: 'varchar', length: 20, nullable: true })
  transactionCode: string | null;

  @Column({ name: 'batch_number', type: 'varchar', length: 50, nullable: true })
  batchNumber: string | null;

  @Column({ name: 'category', type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ name: 'subcategory', type: 'varchar', length: 50, nullable: true })
  subcategory: string | null;

  @Column({ name: 'reconciled', type: 'boolean', default: false })
  reconciled: boolean;

  @Column({ name: 'reconciliation_date', type: 'date', nullable: true })
  reconciliationDate: string | null;

  @Column({ name: 'reconciliation_notes', type: 'text', nullable: true })
  reconciliationNotes: string | null;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ name: 'recurring_frequency', type: 'varchar', length: 20, nullable: true })
  recurringFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;

  @Column({ name: 'next_recurring_date', type: 'date', nullable: true })
  nextRecurringDate: string | null;

  @Column({ name: 'parent_transaction_id', type: 'uuid', nullable: true })
  parentTransactionId: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'bank_account_id', type: 'uuid' })
  bankAccountId: string;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
