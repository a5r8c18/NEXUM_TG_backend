import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Company } from './company.entity';

export type ProductCategory = 'insumo' | 'mercancia' | 'produccion';

@Entity('products')
@Unique(['companyId', 'productCode'])
@Index('IDX_products_company', ['companyId'])
@Index('IDX_products_cpcu', ['cpcuCode'])
@Index('IDX_products_category', ['category'])
export class Product {
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

  @Column({ type: 'varchar', length: 20, default: 'mercancia' })
  category: ProductCategory;

  @Column({ name: 'cpcu_code', type: 'varchar', length: 50, nullable: true })
  cpcuCode: string | null;

  @Column({ name: 'cpcu_description', type: 'varchar', length: 255, nullable: true })
  cpcuDescription: string | null;

  @Column({ name: 'default_account_code', type: 'varchar', length: 20, nullable: true })
  defaultAccountCode: string | null;

  @Column({ name: 'default_supplier', type: 'varchar', length: 255, nullable: true })
  defaultSupplier: string | null;

  @Column({ name: 'barcode', type: 'varchar', length: 100, nullable: true })
  barcode: string | null;

  @Column({
    name: 'default_unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  defaultUnitPrice: number;

  @Column({ name: 'min_stock', type: 'int', default: 0 })
  minStock: number;

  @Column({ name: 'max_stock', type: 'int', default: 0 })
  maxStock: number;

  @Column({ name: 'reorder_point', type: 'int', default: 0 })
  reorderPoint: number;

  @Column({ name: 'is_perishable', type: 'boolean', default: false })
  isPerishable: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
