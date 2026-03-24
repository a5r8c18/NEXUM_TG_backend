import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Purchase } from './purchase.entity';

@Entity('purchase_products')
export class PurchaseProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'purchase_id' })
  purchaseId: string;

  @ManyToOne(() => Purchase, (purchase) => purchase.products)
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase;

  @Column({ name: 'product_code', length: 50 })
  productCode: string;

  @Column({ name: 'product_name', length: 255 })
  productName: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ name: 'total_price', type: 'decimal', precision: 12, scale: 2 })
  totalPrice: number;

  @Column({ name: 'product_unit', length: 20, default: 'und' })
  productUnit: string;
}
