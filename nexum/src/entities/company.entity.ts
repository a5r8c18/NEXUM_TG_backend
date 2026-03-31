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
