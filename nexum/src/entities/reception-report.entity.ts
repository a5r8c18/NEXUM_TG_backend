import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Company } from './company.entity';
import { Warehouse } from './warehouse.entity';
import { ReceptionReportItem } from './reception-report-item.entity';

@Entity('reception_reports')
export class ReceptionReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'report_number', type: 'varchar', length: 20, unique: true })
  reportNumber: string;

  @Column({ name: 'report_date', type: 'date' })
  reportDate: string;

  @Column({ name: 'purchase_id', type: 'uuid', nullable: true })
  purchaseId: string | null;

  @Column({ name: 'supplier_name', type: 'varchar', length: 200 })
  supplierName: string;

  @Column({ name: 'supplier_nit', type: 'varchar', length: 20, nullable: true })
  supplierNit: string | null;

  @Column({ name: 'invoice_number', type: 'varchar', length: 50, nullable: true })
  invoiceNumber: string | null;

  @Column({ name: 'invoice_date', type: 'date', nullable: true })
  invoiceDate: string | null;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @Column({ name: 'received_by', type: 'varchar', length: 100 })
  receivedBy: string;

  @Column({ name: 'verified_by', type: 'varchar', length: 100, nullable: true })
  verifiedBy: string | null;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'verified' | 'cancelled';

  @Column({ name: 'total_items', type: 'integer', default: 0 })
  totalItems: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @OneToMany(() => ReceptionReportItem, item => item.receptionReport)
  items: ReceptionReportItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;
}
