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
import { Invoice } from './invoice.entity';
import { Payment } from './payment.entity';

@Entity('account_receivables')
export class AccountReceivable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ar_number', type: 'varchar', length: 20, unique: true })
  arNumber: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 50 })
  invoiceNumber: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 200 })
  customerName: string;

  @Column({ name: 'customer_id', type: 'varchar', length: 50, nullable: true })
  customerId: string | null;

  @Column({ name: 'customer_address', type: 'text', nullable: true })
  customerAddress: string | null;

  @Column({ name: 'customer_phone', type: 'varchar', length: 20, nullable: true })
  customerPhone: string | null;

  @Column({ name: 'customer_email', type: 'varchar', length: 100, nullable: true })
  customerEmail: string | null;

  @Column({ name: 'customer_nit', type: 'varchar', length: 20, nullable: true })
  customerNit: string | null;

  @Column({ name: 'original_amount', type: 'decimal', precision: 12, scale: 2 })
  originalAmount: number;

  @Column({ name: 'balance_amount', type: 'decimal', precision: 12, scale: 2 })
  balanceAmount: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'aging_days', type: 'integer', default: 0 })
  agingDays: number;

  @Column({ name: 'aging_category', type: 'varchar', length: 20, default: 'current' })
  agingCategory: 'current' | '1-30' | '31-60' | '61-90' | '91-120' | 'over-120';

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'written_off' | 'disputed';

  @Column({ name: 'priority', type: 'varchar', length: 20, default: 'normal' })
  priority: 'low' | 'normal' | 'high' | 'urgent';

  @Column({ name: 'credit_limit', type: 'decimal', precision: 12, scale: 2, nullable: true })
  creditLimit: number | null;

  @Column({ name: 'available_credit', type: 'decimal', precision: 12, scale: 2, nullable: true })
  availableCredit: number | null;

  @Column({ name: 'last_payment_date', type: 'date', nullable: true })
  lastPaymentDate: string | null;

  @Column({ name: 'last_payment_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastPaymentAmount: number | null;

  @Column({ name: 'collection_notes', type: 'text', nullable: true })
  collectionNotes: string | null;

  @Column({ name: 'dispute_reason', type: 'text', nullable: true })
  disputeReason: string | null;

  @Column({ name: 'dispute_date', type: 'date', nullable: true })
  disputeDate: string | null;

  @Column({ name: 'written_off_date', type: 'date', nullable: true })
  writtenOffDate: string | null;

  @Column({ name: 'written_off_reason', type: 'text', nullable: true })
  writtenOffReason: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @OneToMany(() => Payment, (payment: any) => payment.accountReceivable)
  payments: Payment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
