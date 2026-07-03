import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';
import { PhysicalCountItem } from './physical-count-item.entity';

export type PhysicalCountStatus = 'draft' | 'in_progress' | 'completed' | 'approved' | 'cancelled';

@Entity('physical_counts')
@Index('IDX_physical_counts_company', ['companyId'])
@Index('IDX_physical_counts_status', ['status'])
export class PhysicalCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'count_number', type: 'varchar', length: 50 })
  countNumber: string;

  @Column({ name: 'warehouse_id', type: 'varchar', length: 50 })
  warehouseId: string;

  @Column({ name: 'warehouse_name', type: 'varchar', length: 255 })
  warehouseName: string;

  @Column({ type: 'date' })
  date: string;

  // SC-2-22 (Conteo Físico) - Campos específicos del formato oficial MINCIN
  @Column({ name: 'authorization_number', type: 'varchar', length: 50, nullable: true })
  authorizationNumber: string | null;

  @Column({ name: 'authorization_date', type: 'timestamp', nullable: true })
  authorizationDate: Date | null;

  @Column({ name: 'responsible_person', type: 'varchar', length: 255, nullable: true })
  responsiblePerson: string | null;

  @Column({ name: 'count_team', type: 'text', nullable: true })
  countTeam: string | null;

  @Column({ name: 'count_method', type: 'varchar', length: 100, default: 'complete' })
  countMethod: string;

  @Column({ name: 'count_period_start', type: 'date', nullable: true })
  countPeriodStart: Date | null;

  @Column({ name: 'count_period_end', type: 'date', nullable: true })
  countPeriodEnd: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: PhysicalCountStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 255, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'total_surplus', type: 'int', default: 0 })
  totalSurplus: number;

  @Column({ name: 'total_shortage', type: 'int', default: 0 })
  totalShortage: number;

  @Column({ name: 'surplus_value', type: 'decimal', precision: 15, scale: 2, default: 0 })
  surplusValue: number;

  @Column({ name: 'shortage_value', type: 'decimal', precision: 15, scale: 2, default: 0 })
  shortageValue: number;

  @OneToMany(() => PhysicalCountItem, (item) => item.physicalCount, { cascade: true })
  items: PhysicalCountItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
