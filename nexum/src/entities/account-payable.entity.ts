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
import { Purchase } from './purchase.entity';
import { Payment } from './payment.entity';

@Entity('account_payables')
export class AccountPayable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ap_number', type: 'varchar', length: 20, unique: true })
  apNumber: string;

  @Column({ name: 'purchase_id', type: 'uuid', nullable: true })
  purchaseId: string | null;

  @Column({ name: 'purchase_number', type: 'varchar', length: 50, nullable: true })
  purchaseNumber: string | null;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'supplier_name', type: 'varchar', length: 200 })
  supplierName: string;

  @Column({ name: 'supplier_nit', type: 'varchar', length: 20 })
  supplierNit: string;

  @Column({ name: 'supplier_address', type: 'text', nullable: true })
  supplierAddress: string | null;

  @Column({ name: 'supplier_phone', type: 'varchar', length: 20, nullable: true })
  supplierPhone: string | null;

  @Column({ name: 'supplier_email', type: 'varchar', length: 100, nullable: true })
  supplierEmail: string | null;

  @Column({ name: 'invoice_number', type: 'varchar', length: 50, nullable: true })
  invoiceNumber: string | null;

  @Column({ name: 'invoice_date', type: 'date', nullable: true })
  invoiceDate: string | null;

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
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'disputed' | 'cancelled';

  @Column({ name: 'priority', type: 'varchar', length: 20, default: 'normal' })
  priority: 'low' | 'normal' | 'high' | 'urgent';

  @Column({ name: 'payment_terms', type: 'varchar', length: 50, default: 'contado' })
  paymentTerms: string;

  @Column({ name: 'early_payment_discount', type: 'decimal', precision: 5, scale: 2, default: 0 })
  earlyPaymentDiscount: number;

  @Column({ name: 'late_payment_penalty', type: 'decimal', precision: 5, scale: 2, default: 0 })
  latePaymentPenalty: number;

  @Column({ name: 'last_payment_date', type: 'date', nullable: true })
  lastPaymentDate: string | null;

  @Column({ name: 'last_payment_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastPaymentAmount: number | null;

  @Column({ name: 'payment_notes', type: 'text', nullable: true })
  paymentNotes: string | null;

  @Column({ name: 'dispute_reason', type: 'text', nullable: true })
  disputeReason: string | null;

  @Column({ name: 'dispute_date', type: 'date', nullable: true })
  disputeDate: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'CUP' })
  currency: string;

  @Column({ name: 'exchange_rate', type: 'decimal', precision: 8, scale: 4, default: 1 })
  exchangeRate: number;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => Purchase, { nullable: true })
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase | null;

  @OneToMany(() => Payment, (payment: any) => payment.accountPayable)
  payments: Payment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
