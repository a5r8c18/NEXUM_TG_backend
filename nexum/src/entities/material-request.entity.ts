import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Warehouse } from './warehouse.entity';
import { Department } from './department.entity';
import { MaterialRequestItem } from './material-request-item.entity';

@Entity('material_requests')
export class MaterialRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'request_number', type: 'varchar', length: 20, unique: true })
  requestNumber: string;

  @Column({ name: 'request_date', type: 'date' })
  requestDate: string;

  @Column({ name: 'request_type', type: 'varchar', length: 20, default: 'internal' })
  requestType: 'internal' | 'external' | 'production';

  @Column({ name: 'requesting_department_id', type: 'uuid', nullable: true })
  requestingDepartmentId: string | null;

  @Column({ name: 'requesting_department_name', type: 'varchar', length: 200, nullable: true })
  requestingDepartmentName: string | null;

  @Column({ name: 'requester_name', type: 'varchar', length: 100 })
  requesterName: string;

  @Column({ name: 'requester_position', type: 'varchar', length: 100, nullable: true })
  requesterPosition: string | null;

  @Column({ name: 'destination_warehouse_id', type: 'uuid' })
  destinationWarehouseId: string;

  @Column({ name: 'destination_warehouse_name', type: 'varchar', length: 200 })
  destinationWarehouseName: string;

  @Column({ name: 'purpose', type: 'text', nullable: true })
  purpose: string | null;

  @Column({ name: 'urgency_level', type: 'varchar', length: 20, default: 'normal' })
  urgencyLevel: 'low' | 'normal' | 'high' | 'urgent';

  @Column({ name: 'required_date', type: 'date', nullable: true })
  requiredDate: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'submitted' | 'approved' | 'partially_approved' | 'rejected' | 'completed' | 'cancelled';

  @Column({ name: 'approved_by', type: 'varchar', length: 100, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approval_notes', type: 'text', nullable: true })
  approvalNotes: string | null;

  @Column({ name: 'total_items', type: 'integer', default: 0 })
  totalItems: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'destination_warehouse_id' })
  destinationWarehouse: Warehouse;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'requesting_department_id' })
  requestingDepartment: Department | null;

  @OneToMany(() => MaterialRequestItem, (item: any) => item.materialRequest)
  items: MaterialRequestItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
