import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('fixed_assets')
@Index('IDX_fixed_assets_company_id', ['companyId'])
@Index('IDX_fixed_assets_status', ['status'])
@Index('IDX_fixed_assets_group', ['groupNumber'])
export class FixedAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'asset_code', length: 50, unique: true })
  assetCode: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'group_number', type: 'int' })
  groupNumber: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subgroup: string | null;

  @Column({
    name: 'subgroup_detail',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  subgroupDetail: string | null;

  @Column({
    name: 'depreciation_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  depreciationRate: number;

  @Column({
    name: 'acquisition_value',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  acquisitionValue: number;

  @Column({ name: 'current_value', type: 'decimal', precision: 12, scale: 2 })
  currentValue: number;

  @Column({ name: 'acquisition_date', type: 'date' })
  acquisitionDate: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({
    name: 'responsible_person',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  responsiblePerson: string | null;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
