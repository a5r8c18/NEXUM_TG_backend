import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Warehouse } from './warehouse.entity';
import { User } from './user.entity';
import { UserCompany } from './user-company.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'tax_id', length: 50, unique: true })
  taxId: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'logo_path', type: 'varchar', length: 500, nullable: true })
  logoPath: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'tenant_id', type: 'varchar', length: 100, nullable: true })
  tenantId: string | null;

  @Column({
    name: 'tenant_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  tenantType: string | null;

  @Column({ name: 'sales_tax_rate', type: 'decimal', precision: 5, scale: 2, default: 0, nullable: true })
  salesTaxRate: number | null;

  @Column({ name: 'income_tax_rate', type: 'decimal', precision: 5, scale: 2, default: 35, nullable: true })
  incomeTaxRate: number | null;

  /**
   * Tarifas del pago adicional por nocturnidad en CUP por hora, fijadas por
   * la entidad dentro del rango de la Res. 17/2025 MTSS: 0,60-1,20 de 7:00 pm
   * a 11:00 pm y 1,15-2,30 de 11:00 pm a 7:00 am.
   */
  @Column({ name: 'night_shift_rate_evening', type: 'decimal', precision: 6, scale: 2, default: 0.6 })
  nightShiftRateEvening: number;

  @Column({ name: 'night_shift_rate_night', type: 'decimal', precision: 6, scale: 2, default: 1.15 })
  nightShiftRateNight: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Warehouse, (warehouse) => warehouse.company)
  warehouses: Warehouse[];

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => UserCompany, (userCompany) => userCompany.company)
  userCompanies: UserCompany[];
}
