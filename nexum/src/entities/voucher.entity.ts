import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { VoucherLine } from './voucher-line.entity';
import { AccountingPeriod } from './accounting-period.entity';

export type VoucherType =
  | 'factura'
  | 'recibo'
  | 'nota_debito'
  | 'nota_credito'
  | 'nomina'
  | 'depreciacion'
  | 'ajuste'
  | 'apertura'
  | 'cierre'
  | 'otro';

export type VoucherStatus = 'draft' | 'posted' | 'cancelled';

export type SourceModule =
  | 'inventory'
  | 'invoices'
  | 'fixed-assets'
  | 'hr'
  | 'manual';

@Entity('vouchers')
export class Voucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'voucher_number', length: 50 })
  voucherNumber: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 30, default: 'otro' })
  type: VoucherType;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: VoucherStatus;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
  })
  totalAmount: number;

  @Column({
    name: 'source_module',
    type: 'varchar',
    length: 30,
    default: 'manual',
  })
  sourceModule: SourceModule;

  @Column({
    name: 'source_document_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  sourceDocumentId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ name: 'period_id', type: 'uuid', nullable: true })
  periodId: string | null;

  @ManyToOne(() => AccountingPeriod, { nullable: true })
  @JoinColumn({ name: 'period_id' })
  period: AccountingPeriod;

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

  @OneToMany(() => VoucherLine, (line) => line.voucher, {
    cascade: true,
    eager: true,
  })
  lines: VoucherLine[];
}
