import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';
import { InvoiceItem } from './invoice-item.entity';

@Entity('invoices')
@Index('IDX_invoices_company_id', ['companyId'])
@Index('IDX_invoices_status', ['status'])
@Index('IDX_invoices_date', ['date'])
@Index('IDX_invoices_company_status', ['companyId', 'status'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'invoice_number', length: 50, unique: true })
  invoiceNumber: string;

  @Column({ name: 'customer_name', length: 255 })
  customerName: string;

  @Column({ name: 'customer_id', length: 50, nullable: true })
  customerId: string;

  @Column({ name: 'customer_address', type: 'text', nullable: true })
  customerAddress: string;

  @Column({ name: 'customer_phone', length: 50, nullable: true })
  customerPhone: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 16,
  })
  taxRate: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'created_by_name', length: 255, nullable: true })
  createdByName: string;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items: InvoiceItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
