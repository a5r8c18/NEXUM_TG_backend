import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Movement } from './movement.entity';

@Entity('movement_items')
export class MovementItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'movement_id', type: 'uuid' })
  movementId: string;

  @ManyToOne(() => Movement, (m) => m.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movement_id' })
  movement: Movement;

  @Column({ name: 'product_code', type: 'varchar', length: 50 })
  productCode: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  unitPrice: number;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
  })
  totalAmount: number;

  @Column({ name: 'product_unit', type: 'varchar', length: 20, nullable: true })
  productUnit: string | null;

  @Column({ name: 'product_description', type: 'varchar', length: 500, nullable: true })
  productDescription: string | null;

  @Column({ name: 'expense_element', type: 'varchar', length: 100, nullable: true })
  expenseElement: string | null;
}
