import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Account } from './account.entity';

export type SubaccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense';
export type SubaccountNature = 'deudora' | 'acreedora';

@Entity('subaccounts')
export class Subaccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'account_id' })
  accountId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'subaccount_code' })
  subaccountCode: string;

  @Column({ name: 'subaccount_name' })
  subaccountName: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', default: 'expense' })
  type: SubaccountType;

  @Column({ type: 'varchar', default: 'deudora' })
  nature: SubaccountNature;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'allows_movements', default: true })
  allowsMovements: boolean;

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
