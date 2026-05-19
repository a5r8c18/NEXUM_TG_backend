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
import { AccountReceivable } from './account-receivable.entity';
import { AccountPayable } from './account-payable.entity';
import { BankAccount } from './bank-account.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_number', type: 'varchar', length: 20, unique: true })
  paymentNumber: string;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({ name: 'payment_type', type: 'varchar', length: 20 })
  paymentType: 'receivable' | 'payable';

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod: 'cash' | 'bank_transfer' | 'check' | 'credit_card' | 'debit_card' | 'other';

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'CUP' })
  currency: string;

  @Column({ name: 'exchange_rate', type: 'decimal', precision: 8, scale: 4, default: 1 })
  exchangeRate: number;

  @Column({ name: 'description', type: 'varchar', length: 200, nullable: true })
  description: string | null;

  @Column({ name: 'reference_number', type: 'varchar', length: 50, nullable: true })
  referenceNumber: string | null;

  @Column({ name: 'check_number', type: 'varchar', length: 50, nullable: true })
  checkNumber: string | null;

  @Column({ name: 'check_date', type: 'date', nullable: true })
  checkDate: string | null;

  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName: string | null;

  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ name: 'authorization_code', type: 'varchar', length: 50, nullable: true })
  authorizationCode: string | null;

  @Column({ name: 'card_last_four', type: 'varchar', length: 4, nullable: true })
  cardLastFour: string | null;

  @Column({ name: 'paid_by', type: 'varchar', length: 100, nullable: true })
  paidBy: string | null;

  @Column({ name: 'received_by', type: 'varchar', length: 100, nullable: true })
  receivedBy: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ name: 'refund_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  refundAmount: number;

  @Column({ name: 'refund_date', type: 'date', nullable: true })
  refundDate: string | null;

  @Column({ name: 'refund_reason', type: 'text', nullable: true })
  refundReason: string | null;

  @Column({ name: 'early_payment_discount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  earlyPaymentDiscount: number;

  @Column({ name: 'late_payment_penalty', type: 'decimal', precision: 12, scale: 2, default: 0 })
  latePaymentPenalty: number;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'account_receivable_id', type: 'uuid', nullable: true })
  accountReceivableId: string | null;

  @Column({ name: 'account_payable_id', type: 'uuid', nullable: true })
  accountPayableId: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => AccountReceivable, { nullable: true })
  @JoinColumn({ name: 'account_receivable_id' })
  accountReceivable: AccountReceivable | null;

  @ManyToOne(() => AccountPayable, { nullable: true })
  @JoinColumn({ name: 'account_payable_id' })
  accountPayable: AccountPayable | null;

  @ManyToOne(() => BankAccount, { nullable: true })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
