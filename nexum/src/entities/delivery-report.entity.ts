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

  // SC-2-08 (Vale de Entrega) - Campos específicos del formato oficial MINCIN
  @Column({ name: 'report_number', type: 'varchar', length: 50, unique: true, nullable: true })
  reportNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reportDate: Date | null;

  @Column({ name: 'entity_name', type: 'varchar', length: 255, nullable: true })
  entityName: string | null;

  @Column({ name: 'entity_nit', type: 'varchar', length: 50, nullable: true })
  entityNit: string | null;

  @Column({ name: 'warehouse_id', type: 'varchar', length: 100, nullable: true })
  warehouseId: string | null;

  @Column({ name: 'warehouse_name', type: 'varchar', length: 255, nullable: true })
  warehouseName: string | null;

  @Column({ name: 'authorization_document', type: 'varchar', length: 100, nullable: true })
  authorizationDocument: string | null;

  @Column({ name: 'delivered_by', type: 'varchar', length: 255, nullable: true })
  deliveredBy: string | null;

  @Column({ name: 'received_by', type: 'varchar', length: 255, nullable: true })
  receivedBy: string | null;

  @Column({ name: 'received_at', type: 'timestamp', nullable: true })
  receivedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  products: string | null;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalAmount: number | null;

  @Column({ name: 'report_type', type: 'varchar', length: 50, nullable: true })
  reportType: string | null;

  @Column({ type: 'text', nullable: true })
  observations: string | null;

  @Column({ name: 'status', type: 'varchar', length: 50, nullable: true })
  status: string | null;

  @Column({
    name: 'created_by_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  createdByName: string | null;

  @Column({ name: 'employee_id', type: 'varchar', length: 100, nullable: true })
  employeeId: string | null;

  @Column({ name: 'employee_name', type: 'varchar', length: 255, nullable: true })
  employeeName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
