import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Warehouse } from './warehouse.entity';
import { Product } from './product.entity';
import { BinCardMovement } from './bin-card-movement.entity';

@Entity('bin_cards')
export class BinCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'card_number', type: 'varchar', length: 20, unique: true })
  cardNumber: string;

  @Column({ name: 'product_code', type: 'varchar', length: 50 })
  productCode: string;

  @Column({ name: 'product_name', type: 'varchar', length: 200 })
  productName: string;

  @Column({ name: 'product_unit', type: 'varchar', length: 20 })
  productUnit: string;

  @Column({ name: 'min_stock', type: 'decimal', precision: 10, scale: 2, default: 0 })
  minStock: number;

  @Column({ name: 'max_stock', type: 'decimal', precision: 10, scale: 2, default: 0 })
  maxStock: number;

  @Column({ name: 'reorder_point', type: 'decimal', precision: 10, scale: 2, default: 0 })
  reorderPoint: number;

  @Column({ name: 'current_balance', type: 'decimal', precision: 10, scale: 2, default: 0 })
  currentBalance: number;

  @Column({ name: 'location', type: 'varchar', length: 100, nullable: true })
  location: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => Warehouse)
  warehouse: Warehouse;

  @ManyToOne(() => Product)
  product: Product;

  @OneToMany(() => BinCardMovement, movement => movement.binCard)
  movements: BinCardMovement[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
