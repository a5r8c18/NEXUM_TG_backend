import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('inventory')
@Index('IDX_inventory_company_id', ['companyId'])
@Index('IDX_inventory_product_code', ['productCode'])
@Index('IDX_inventory_company_product', ['companyId', 'productCode'])
export class Inventory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'product_code', length: 50 })
  productCode: string;

  @Column({ name: 'product_name', length: 255 })
  productName: string;

  @Column({ name: 'product_description', type: 'text', nullable: true })
  productDescription: string | null;

  @Column({ name: 'product_unit', length: 20, default: 'und' })
  productUnit: string;

  @Column({ type: 'int', default: 0 })
  entries: number;

  @Column({ type: 'int', default: 0 })
  exits: number;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ name: 'stock_limit', type: 'int', default: 0 })
  stockLimit: number;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  unitPrice: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  warehouse: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  entity: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
