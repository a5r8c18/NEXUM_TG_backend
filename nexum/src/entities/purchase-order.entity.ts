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
import { Supplier } from './supplier.entity';
import { Warehouse } from './warehouse.entity';
import { Department } from './department.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_number', type: 'varchar', length: 20, unique: true })
  orderNumber: string;

  @Column({ name: 'order_date', type: 'date' })
  orderDate: string;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate: string | null;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'supplier_name', type: 'varchar', length: 200 })
  supplierName: string;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @Column({ name: 'warehouse_name', type: 'varchar', length: 200 })
  warehouseName: string;

  @Column({ name: 'requesting_department_id', type: 'uuid', nullable: true })
  requestingDepartmentId: string | null;

  @Column({ name: 'requesting_department_name', type: 'varchar', length: 200, nullable: true })
  requestingDepartmentName: string | null;

  @Column({ name: 'requester_name', type: 'varchar', length: 100 })
  requesterName: string;

  @Column({ name: 'requester_position', type: 'varchar', length: 100, nullable: true })
  requesterPosition: string | null;

  @Column({ name: 'urgency_level', type: 'varchar', length: 20, default: 'normal' })
  urgencyLevel: 'low' | 'normal' | 'high' | 'urgent';

  @Column({ name: 'payment_terms', type: 'varchar', length: 50, default: 'contado' })
  paymentTerms: string;

  @Column({ name: 'delivery_terms', type: 'varchar', length: 100, nullable: true })
  deliveryTerms: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'sent' | 'partially_received' | 'completed' | 'cancelled';

  @Column({ name: 'submitted_by', type: 'varchar', length: 100, nullable: true })
  submittedBy: string | null;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 100, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'total_items', type: 'integer', default: 0 })
  totalItems: number;

  @Column({ name: 'subtotal', type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxRate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'CUP' })
  currency: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'terms_conditions', type: 'text', nullable: true })
  termsConditions: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'requesting_department_id' })
  requestingDepartment: Department | null;

  @OneToMany(() => PurchaseOrderItem, (item: any) => item.purchaseOrder)
  items: PurchaseOrderItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
