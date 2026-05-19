import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Warehouse } from './warehouse.entity';
import { WarehouseReturnItem } from './warehouse-return-item.entity';

@Entity('warehouse_returns')
export class WarehouseReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'return_number', type: 'varchar', length: 20, unique: true })
  returnNumber: string;

  @Column({ name: 'return_date', type: 'date' })
  returnDate: string;

  @Column({ name: 'return_type', type: 'varchar', length: 20, default: 'supplier' })
  returnType: 'supplier' | 'production' | 'adjustment' | 'damage';

  @Column({ name: 'return_reason', type: 'varchar', length: 200 })
  returnReason: string;

  @Column({ name: 'supplier_name', type: 'varchar', length: 200, nullable: true })
  supplierName: string | null;

  @Column({ name: 'supplier_nit', type: 'varchar', length: 20, nullable: true })
  supplierNit: string | null;

  @Column({ name: 'source_warehouse_id', type: 'uuid' })
  sourceWarehouseId: string;

  @Column({ name: 'source_warehouse_name', type: 'varchar', length: 200 })
  sourceWarehouseName: string;

  @Column({ name: 'destination_warehouse_id', type: 'uuid', nullable: true })
  destinationWarehouseId: string | null;

  @Column({ name: 'destination_warehouse_name', type: 'varchar', length: 200, nullable: true })
  destinationWarehouseName: string | null;

  @Column({ name: 'returned_by', type: 'varchar', length: 100 })
  returnedBy: string;

  @Column({ name: 'authorized_by', type: 'varchar', length: 100, nullable: true })
  authorizedBy: string | null;

  @Column({ name: 'authorized_at', type: 'timestamp', nullable: true })
  authorizedAt: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'authorized' | 'processed' | 'cancelled';

  @Column({ name: 'total_items', type: 'integer', default: 0 })
  totalItems: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  company: Company;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'source_warehouse_id' })
  sourceWarehouse: Warehouse;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'destination_warehouse_id' })
  destinationWarehouse: Warehouse | null;

  @OneToMany(() => WarehouseReturnItem, (item: any) => item.warehouseReturn)
  items: WarehouseReturnItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
