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
import { Purchase } from './purchase.entity';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'supplier_code', type: 'varchar', length: 20, unique: true })
  supplierCode: string;

  @Column({ name: 'business_name', type: 'varchar', length: 200 })
  businessName: string;

  @Column({ name: 'trade_name', type: 'varchar', length: 200, nullable: true })
  tradeName: string | null;

  @Column({ name: 'nit', type: 'varchar', length: 20, unique: true })
  nit: string;

  @Column({ name: 'tax_id', type: 'varchar', length: 50, nullable: true })
  taxId: string | null;

  @Column({ name: 'contact_person', type: 'varchar', length: 100, nullable: true })
  contactPerson: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 100, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'city', type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ name: 'province', type: 'varchar', length: 100, nullable: true })
  province: string | null;

  @Column({ name: 'country', type: 'varchar', length: 100, default: 'Cuba' })
  country: string;

  @Column({ name: 'payment_terms', type: 'varchar', length: 50, default: 'contado' })
  paymentTerms: string;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 12, scale: 2, nullable: true })
  creditLimit: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'rating', type: 'integer', nullable: true })
  rating: number | null; // 1-5 stars

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @OneToMany(() => Purchase, purchase => purchase.supplier)
  purchases: Purchase[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
