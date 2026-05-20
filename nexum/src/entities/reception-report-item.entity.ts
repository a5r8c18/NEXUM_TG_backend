import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReceptionReport } from './reception-report.entity';
import { Product } from './product.entity';

@Entity('reception_report_items')
export class ReceptionReportItem {
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

  @Column({ name: 'quantity_ordered', type: 'decimal', precision: 10, scale: 2 })
  quantityOrdered: number;

  @Column({ name: 'quantity_received', type: 'decimal', precision: 10, scale: 2 })
  quantityReceived: number;

  @Column({ name: 'quantity_pending', type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityPending: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ name: 'total_price', type: 'decimal', precision: 12, scale: 2 })
  totalPrice: number;

  @Column({ name: 'batch_number', type: 'varchar', length: 50, nullable: true })
  batchNumber: string | null;

  @Column({ name: 'expiration_date', type: 'date', nullable: true })
  expirationDate: string | null;

  @Column({ name: 'location', type: 'varchar', length: 100, nullable: true })
  location: string | null;

  @Column({ name: 'quality_status', type: 'varchar', length: 20, default: 'approved' })
  qualityStatus: 'approved' | 'rejected' | 'pending';

  @Column({ name: 'quality_notes', type: 'text', nullable: true })
  qualityNotes: string | null;

  @Column({ name: 'reception_report_id', type: 'uuid' })
  receptionReportId: string;

  @ManyToOne(() => ReceptionReport, report => report.items)
  @JoinColumn({ name: 'reception_report_id' })
  receptionReport: ReceptionReport;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_code' })
  product: Product;
}
