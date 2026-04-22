import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Voucher } from './voucher.entity';
import { Account } from './account.entity';
import { CostCenter } from './cost-center.entity';

@Entity('voucher_lines')
export class VoucherLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'voucher_id', type: 'uuid' })
  voucherId: string;

  @ManyToOne(() => Voucher, (voucher) => voucher.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'voucher_id' })
  voucher: Voucher;

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

  @Column({ type: 'varchar', length: 50, nullable: true })
  element: string | null;

  @Column({ name: 'element_name', type: 'varchar', length: 255, nullable: true })
  elementName: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  credit: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter: CostCenter;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ name: 'line_order', type: 'int', default: 0 })
  lineOrder: number;
}
