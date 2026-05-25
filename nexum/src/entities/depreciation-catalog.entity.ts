import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';

/**
 * DepreciationCatalog Entity
 * 
 * Stores the official depreciation catalog for fixed assets according to Cuban accounting standards.
 * This replaces the hardcoded catalog in the service with a persistent database entity.
 * 
 * Based on Cuban accounting norms (NCC) and Resolution 340:
 * - Group numbers correspond to asset categories
 * - Subgroups specify asset types within each category
 * - Rates are defined by Cuban Ministry of Finance regulations
 */
@Entity('depreciation_catalog')
@Index(['companyId'])
@Index(['groupNumber'])
export class DepreciationCatalog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  /**
   * Group number for asset classification (1-10)
   * Based on Cuban fixed asset classification system
   */
  @Column({ type: 'integer', name: 'group_number' })
  groupNumber: number;

  /**
   * Group name/description
   */
  @Column({ type: 'varchar', length: 200, name: 'group_name' })
  groupName: string;

  /**
   * Subgroup name within the group
   */
  @Column({ type: 'varchar', length: 200, name: 'subgroup_name' })
  subgroupName: string;

  /**
   * Annual depreciation rate percentage
   * Defined by Cuban Ministry of Finance regulations
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'depreciation_rate' })
  depreciationRate: number;

  /**
   * Useful life in years (calculated from rate)
   */
  @Column({ type: 'integer', name: 'useful_life_years', nullable: true })
  usefulLifeYears: number | null;

  /**
   * Description of assets in this subgroup
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Whether this entry is active
   */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
