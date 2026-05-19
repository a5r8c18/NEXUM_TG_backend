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
import { BankTransaction } from './bank-transaction.entity';
import { Payment } from './payment.entity';

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_number', type: 'varchar', length: 50, unique: true })
  accountNumber: string;

  @Column({ name: 'account_name', type: 'varchar', length: 200 })
  accountName: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 100 })
  bankName: string;

  @Column({ name: 'bank_code', type: 'varchar', length: 20, nullable: true })
  bankCode: string | null;

  @Column({ name: 'account_type', type: 'varchar', length: 20 })
  accountType: 'checking' | 'savings' | 'investment' | 'credit';

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'CUP' })
  currency: string;

  @Column({ name: 'balance', type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'available_balance', type: 'decimal', precision: 12, scale: 2, default: 0 })
  availableBalance: number;

  @Column({ name: 'overdraft_limit', type: 'decimal', precision: 12, scale: 2, default: 0 })
  overdraftLimit: number;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 12, scale: 2, default: 0 })
  creditLimit: number;

  @Column({ name: 'interest_rate', type: 'decimal', precision: 5, scale: 2, nullable: true })
  interestRate: number | null;

  @Column({ name: 'opening_date', type: 'date' })
  openingDate: string;

  @Column({ name: 'closing_date', type: 'date', nullable: true })
  closingDate: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'inactive' | 'frozen' | 'closed';

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_reconciled', type: 'boolean', default: false })
  isReconciled: boolean;

  @Column({ name: 'last_reconciliation_date', type: 'date', nullable: true })
  lastReconciliationDate: string | null;

  @Column({ name: 'reconciliation_balance', type: 'decimal', precision: 12, scale: 2, nullable: true })
  reconciliationBalance: number | null;

  @Column({ name: 'holder_name', type: 'varchar', length: 200 })
  holderName: string;

  @Column({ name: 'holder_document', type: 'varchar', length: 50, nullable: true })
  holderDocument: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 100, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'branch_name', type: 'varchar', length: 100, nullable: true })
  branchName: string | null;

  @Column({ name: 'branch_address', type: 'text', nullable: true })
  branchAddress: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @OneToMany(() => BankTransaction, (transaction: any) => transaction.bankAccount)
  transactions: BankTransaction[];

  @OneToMany(() => Payment, (payment: any) => payment.bankAccount)
  payments: Payment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
