import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PhysicalCount } from './physical-count.entity';

@Entity('physical_count_items')
export class PhysicalCountItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'physical_count_id' })
  physicalCountId: string;

  @ManyToOne(() => PhysicalCount, (pc) => pc.items)
  @JoinColumn({ name: 'physical_count_id' })
  physicalCount: PhysicalCount;

  @Column({ name: 'product_code', type: 'varchar', length: 50 })
  productCode: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  @Column({ name: 'product_unit', type: 'varchar', length: 20, default: 'und' })
  productUnit: string;

  @Column({ name: 'system_stock', type: 'int', default: 0 })
  systemStock: number;

  @Column({ name: 'physical_stock', type: 'int', default: 0 })
  physicalStock: number;

  @Column({ type: 'int', default: 0 })
  difference: number;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  unitPrice: number;

  @Column({
    name: 'difference_value',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
  })
  differenceValue: number;

  @Column({ name: 'adjustment_movement_id', type: 'uuid', nullable: true })
  adjustmentMovementId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
