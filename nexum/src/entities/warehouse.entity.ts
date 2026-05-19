import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('warehouses')
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company, (company) => company.warehouses)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ length: 255, nullable: true })
  manager: string;

  @Column({ length: 50, nullable: true })
  phone: string;

  // ── Custodio responsable del almacén (Res. 11-2007 MAC) ──
  @Column({ name: 'custodian_id', type: 'uuid', nullable: true })
  custodianId: string | null;

  @Column({ name: 'custodian_name', type: 'varchar', length: 255, nullable: true })
  custodianName: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
