import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MaterialRequest } from './material-request.entity';
import { Product } from './product.entity';

@Entity('material_request_items')
export class MaterialRequestItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'line_number', type: 'integer' })
  lineNumber: number;

  @Column({ name: 'product_code', type: 'varchar', length: 50 })
  productCode: string;

  @Column({ name: 'product_name', type: 'varchar', length: 200 })
  productName: string;

  @Column({ name: 'product_unit', type: 'varchar', length: 20 })
  productUnit: string;

  @Column({ name: 'quantity_requested', type: 'decimal', precision: 10, scale: 2 })
  quantityRequested: number;

  @Column({ name: 'quantity_approved', type: 'decimal', precision: 10, scale: 2, nullable: true })
  quantityApproved: number | null;

  @Column({ name: 'quantity_delivered', type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityDelivered: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  unitPrice: number | null;

  @Column({ name: 'total_price', type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalPrice: number | null;

  @Column({ name: 'priority_level', type: 'varchar', length: 20, default: 'normal' })
  priorityLevel: 'low' | 'normal' | 'high' | 'urgent';

  @Column({ name: 'justification', type: 'text', nullable: true })
  justification: string | null;

  @Column({ name: 'approval_status', type: 'varchar', length: 20, default: 'pending' })
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'partially_approved';

  @Column({ name: 'approval_notes', type: 'text', nullable: true })
  approvalNotes: string | null;

  @Column({ name: 'material_request_id', type: 'uuid' })
  materialRequestId: string;

  @ManyToOne(() => MaterialRequest, request => request.items)
  @JoinColumn({ name: 'material_request_id' })
  materialRequest: MaterialRequest;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_code' })
  product: Product;
}
