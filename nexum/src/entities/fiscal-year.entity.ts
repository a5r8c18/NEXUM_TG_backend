import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { AccountingPeriod } from './accounting-period.entity';

export type FiscalYearStatus = 'open' | 'closed';

@Entity('fiscal_years')
export class FiscalYear {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: FiscalYearStatus;

  @Column({
    name: 'closing_voucher_id',
    type: 'uuid',
    nullable: true,
  })
  closingVoucherId: string | null;

  @Column({
    name: 'opening_voucher_id',
    type: 'uuid',
    nullable: true,
  })
  openingVoucherId: string | null;

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

  @OneToMany(() => AccountingPeriod, (period) => period.fiscalYear)
  periods: AccountingPeriod[];
}
