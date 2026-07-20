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

  @Column({ type: 'varchar', length: 255, nullable: true })
  supplier: string;

  // Enlace opcional a un Supplier real (submayor por tercero). Si es null, solo se usa el nombre.
  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  document: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 100, nullable: true })
  invoiceNumber: string | null;

  @Column({ name: 'invoice_date', type: 'date', nullable: true })
  invoiceDate: Date | null;

  @Column({ name: 'is_invoiced', type: 'boolean', default: false })
  isInvoiced: boolean;

  @Column({ name: 'purchase_order_id', type: 'varchar', length: 100, nullable: true })
  purchaseOrderId: string | null;

  @Column({ name: 'delivery_note_id', type: 'varchar', length: 100, nullable: true })
  deliveryNoteId: string | null;

  @Column({ name: 'is_reconciled', type: 'boolean', default: false })
  isReconciled: boolean;

  @Column({ name: 'reconciled_at', type: 'timestamp', nullable: true })
  reconciledAt: Date | null;

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
