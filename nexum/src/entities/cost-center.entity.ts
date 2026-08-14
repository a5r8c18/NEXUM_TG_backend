import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

export type CostCenterType =
  | 'production'
  | 'administrative'
  | 'sales'
  | 'maintenance'
  | 'research'
  | 'marketing'
  | 'general'
  | 'associated';

@Entity('cost_centers')
export class CostCenter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 30, default: 'general' })
  type: CostCenterType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  manager: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  budget: number;

  // Cuenta de gasto por defecto del PUC cubana asociada a este centro de costo.
  // Ej. 700-0020 (Producción), 731 (Asociados), 822 (Administrativos).
  @Column({ type: 'varchar', length: 20, nullable: true })
  expenseAccountCode: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
