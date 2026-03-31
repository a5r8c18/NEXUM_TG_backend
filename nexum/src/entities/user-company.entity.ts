import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';

@Entity('user_companies')
@Unique(['userId', 'companyId'])
export class UserCompany {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 50, default: 'user' })
  role: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => User, user => user.userCompanies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Company, company => company.userCompanies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;
}
