import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

// SC-2-18 (Informe de Entrega) - Formato oficial MINCIN
@Entity('delivery_informs')
export class DeliveryInform {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'inform_number', type: 'varchar', length: 50, unique: true })
  informNumber: string;

  @Column({ type: 'timestamp' })
  informDate: Date;

  @Column({ name: 'entity_name', type: 'varchar', length: 255 })
  entityName: string;

  @Column({ name: 'entity_nit', type: 'varchar', length: 50, nullable: true })
  entityNit: string | null;

  @Column({ name: 'entity_address', type: 'varchar', length: 500, nullable: true })
  entityAddress: string | null;

  @Column({ name: 'warehouse_id', type: 'varchar', length: 100 })
  warehouseId: string;

  @Column({ name: 'warehouse_name', type: 'varchar', length: 255 })
  warehouseName: string;

  @Column({ name: 'delivery_report_id', type: 'varchar', length: 100, nullable: true })
  deliveryReportId: string | null;

  @Column({ name: 'delivery_report_number', type: 'varchar', length: 50, nullable: true })
  deliveryReportNumber: string | null;

  @Column({ type: 'text' })
  products: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'purpose', type: 'varchar', length: 255, nullable: true })
  purpose: string | null;

  @Column({ type: 'text', nullable: true })
  observations: string | null;

  @Column({ name: 'prepared_by', type: 'varchar', length: 255, nullable: true })
  preparedBy: string | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 255, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'draft' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
