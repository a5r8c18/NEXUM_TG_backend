import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';
import { Voucher } from './voucher.entity';

export type MovementType = 'entry' | 'exit' | 'return' | 'transfer';
export type InventoryCategory = 'insumo' | 'mercancia' | 'produccion';

@Entity('movements')
@Index('IDX_movements_company_id', ['companyId'])
@Index('IDX_movements_type', ['movementType'])
@Index('IDX_movements_created_at', ['createdAt'])
@Index('IDX_movements_company_type', ['companyId', 'movementType'])
@Index('IDX_movements_code', ['movementCode'])
@Index('IDX_movements_category', ['category'])
export class Movement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ 
    name: 'movement_type', 
    length: 20,
    type: 'varchar',
    default: 'entry'
  })
  movementType: MovementType;

  @Column({ name: 'movement_code', type: 'varchar', length: 10, nullable: true })
  movementCode: string | null;

  @Column({ name: 'movement_description', type: 'varchar', length: 255, nullable: true })
  movementDescription: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  category: InventoryCategory | null;

  @Column({ name: 'product_code', length: 50 })
  productCode: string;

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

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  @Column({ name: 'source_warehouse', type: 'varchar', length: 50, nullable: true })
  sourceWarehouse: string | null;

  @Column({ name: 'destination_warehouse', type: 'varchar', length: 50, nullable: true })
  destinationWarehouse: string | null;

  @Column({ name: 'user_name', type: 'varchar', length: 255, nullable: true })
  userName: string | null;

  @Column({ name: 'purchase_id', type: 'varchar', nullable: true })
  purchaseId: string | null;

  @Column({ name: 'voucher_id', type: 'uuid', nullable: true })
  voucherId: string | null;

  @ManyToOne(() => Voucher, { nullable: true })
  @JoinColumn({ name: 'voucher_id' })
  voucher: Voucher;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
