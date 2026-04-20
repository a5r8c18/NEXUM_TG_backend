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

export type MovementType = 'entry' | 'exit' | 'return' | 'transfer';

@Entity('movements')
@Index('IDX_movements_company_id', ['companyId'])
@Index('IDX_movements_type', ['movementType'])
@Index('IDX_movements_created_at', ['createdAt'])
@Index('IDX_movements_company_type', ['companyId', 'movementType'])
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

  @Column({ name: 'product_code', length: 50 })
  productCode: string;

  @Column({ type: 'int' })
  quantity: number;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
