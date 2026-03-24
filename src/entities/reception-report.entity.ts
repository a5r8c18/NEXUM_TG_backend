import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('reception_reports')
export class ReceptionReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'purchase_id', nullable: true })
  purchaseId: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'text' })
  details: string;

  @Column({ name: 'created_by_name', length: 255, nullable: true })
  createdByName: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
