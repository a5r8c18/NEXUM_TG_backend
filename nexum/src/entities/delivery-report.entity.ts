import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('delivery_reports')
export class DeliveryReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'purchase_id', type: 'varchar', nullable: true })
  purchaseId: string | null;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  entity: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  warehouse: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  document: string | null;

  @Column({ type: 'text' })
  products: string;

  @Column({ type: 'timestamp', nullable: true })
  date: Date;

  @Column({ name: 'report_type', type: 'varchar', length: 50, nullable: true })
  reportType: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({
    name: 'created_by_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  createdByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
