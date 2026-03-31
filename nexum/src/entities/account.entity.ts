import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type AccountNature = 'deudora' | 'acreedora';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

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

  @Column({ type: 'varchar', nullable: true })
  groupNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  parentCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  parentAccountId: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  allowsMovements: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
