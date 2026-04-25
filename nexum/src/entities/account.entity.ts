import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type AccountNature = 'deudora' | 'acreedora';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'companyId' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', default: 'asset' })
  type: AccountType;

  @Column({ type: 'varchar', default: 'deudora' })
  nature: AccountNature;

  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ name: 'group_number', type: 'varchar', nullable: true })
  groupNumber: string | null;

  @Column({ name: 'parent_code', type: 'varchar', nullable: true })
  parentCode: string | null;

  @Column({ name: 'parent_account_id', type: 'uuid', nullable: true })
  parentAccountId: string | null;

  @ManyToOne(() => Account, { nullable: true })
  @JoinColumn({ name: 'parent_account_id' })
  parentAccount: Account | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'allows_movements', default: false })
  allowsMovements: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
