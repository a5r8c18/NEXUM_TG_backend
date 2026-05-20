import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';
import { Voucher } from './voucher.entity';
import { MovementItem } from './movement-item.entity';
import { CostCenter } from './cost-center.entity';
import { Subelement } from './subelement.entity';

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

  // Legacy: para movimientos de un solo producto o resumen
  @Column({ name: 'product_code', type: 'varchar', length: 50, nullable: true })
  productCode: string | null;

  @Column({ type: 'int', default: 0 })
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

  @Column({ name: 'item_count', type: 'int', default: 1 })
  itemCount: number;

  @OneToMany(() => MovementItem, (item) => item.movement, { cascade: true, eager: false })
  items: MovementItem[];

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

  @Column({ name: 'related_movement_id', type: 'uuid', nullable: true })
  relatedMovementId: string | null;

  @Column({ name: 'expense_element', type: 'varchar', length: 100, nullable: true })
  expenseElement: string | null;

  @Column({ name: 'entity_name', type: 'varchar', length: 255, nullable: true })
  entityName: string | null;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter: CostCenter;

  @Column({ name: 'subelement_id', type: 'uuid', nullable: true })
  subelementId: string | null;

  @ManyToOne(() => Subelement, { nullable: true })
  @JoinColumn({ name: 'subelement_id' })
  subelement: Subelement;

  @Column({ name: 'voucher_id', type: 'uuid', nullable: true })
  voucherId: string | null;

  @ManyToOne(() => Voucher, { nullable: true })
  @JoinColumn({ name: 'voucher_id' })
  voucher: Voucher;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
