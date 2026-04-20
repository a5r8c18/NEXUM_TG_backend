import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';
import { PurchaseProduct } from './purchase-product.entity';

@Entity('purchases')
@Index('IDX_purchases_company_id', ['companyId'])
@Index('IDX_purchases_created_at', ['createdAt'])
export class Purchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 255 })
  entity: string;

  @Column({ length: 255 })
  warehouse: string;

  @Column({ length: 255, nullable: true })
  supplier: string;

  @Column({ length: 100, nullable: true })
  document: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @OneToMany(() => PurchaseProduct, (pp) => pp.purchase, { cascade: true })
  products: PurchaseProduct[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
