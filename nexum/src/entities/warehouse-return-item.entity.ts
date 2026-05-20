import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WarehouseReturn } from './warehouse-return.entity';
import { Product } from './product.entity';

@Entity('warehouse_return_items')
export class WarehouseReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'line_number', type: 'integer' })
  lineNumber: number;

  @Column({ name: 'product_code', type: 'varchar' })
  productCode: string;

  @Column({ name: 'product_name', type: 'varchar', length: 200 })
  productName: string;

  @Column({ name: 'product_unit', type: 'varchar', length: 20 })
  productUnit: string;

  @Column({ name: 'quantity_returned', type: 'decimal', precision: 10, scale: 2 })
  quantityReturned: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ name: 'total_price', type: 'decimal', precision: 12, scale: 2 })
  totalPrice: number;

  @Column({ name: 'batch_number', type: 'varchar', length: 50, nullable: true })
  batchNumber: string | null;

  @Column({ name: 'expiration_date', type: 'date', nullable: true })
  expirationDate: string | null;

  @Column({ name: 'return_reason_detail', type: 'text', nullable: true })
  returnReasonDetail: string | null;

  @Column({ name: 'condition_status', type: 'varchar', length: 20, default: 'good' })
  conditionStatus: 'good' | 'damaged' | 'expired' | 'defective';

  @Column({ name: 'condition_notes', type: 'text', nullable: true })
  conditionNotes: string | null;

  @Column({ name: 'warehouse_return_id', type: 'uuid' })
  warehouseReturnId: string;

  @ManyToOne(() => WarehouseReturn, returnDoc => returnDoc.items)
  @JoinColumn({ name: 'warehouse_return_id' })
  warehouseReturn: WarehouseReturn;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_code' })
  product: Product;
}
