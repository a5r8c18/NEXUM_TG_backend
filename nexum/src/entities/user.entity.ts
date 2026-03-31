import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Company } from './company.entity';
import { UserCompany } from './user-company.entity';

export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  USER = 'user',
  FACTURADOR = 'facturador'
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ 
  length: 255, 
  nullable: true,
  type: 'varchar'
})
  password: string | null;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({
    length: 50,
    type: 'varchar',
    default: UserRole.USER
  })
  role: UserRole;

  @Column({ name: 'tenant_id', length: 100, nullable: true })
  tenantId: string;

  @Column({ name: 'tenant_name', length: 255, nullable: true })
  tenantName: string;

  @Column({
    name: 'tenant_type',
    length: 50,
    default: 'SINGLE_COMPANY',
  })
  tenantType: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: number;

  @ManyToOne(() => Company, (company) => company.users, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => UserCompany, userCompany => userCompany.user)
  userCompanies: UserCompany[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
