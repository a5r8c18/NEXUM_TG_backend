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
import { FixedAsset } from './fixed-asset.entity';

/**
 * FixedAssetInventory Entity
 * 
 * Official Cuban fixed asset inventory record according to NCC (Normas Contables Cubanas).
 * This is the official model for the "Registro de Inventario de Activos Fijos Tangibles"
 * required by Resolution 340 of the Ministry of Finance and Prices (2004).
 * 
 * Key requirements from Cuban accounting standards:
 * - Complete inventory of all fixed assets
 * - Asset classification by group and subgroup
 * - Acquisition date and value tracking
 * - Depreciation tracking (annual and accumulated)
 * - Current book value calculation
 * - Location and responsibility tracking
 * - Status (active, disposed, transferred)
 */
@Entity('fixed_asset_inventory')
@Index(['companyId'])
@Index(['assetId'])
@Index(['reportDate'])
@Index(['groupNumber'])
export class FixedAssetInventory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'asset_id' })
  assetId: number;

  /**
   * Report date for this inventory record
   * Cuban standards require periodic inventory reports (typically annually)
   */
  @Column({ type: 'date', name: 'report_date' })
  reportDate: Date;

  /**
   * Asset code (unique identifier)
   */
  @Column({ type: 'varchar', length: 50, name: 'asset_code' })
  assetCode: string;

  /**
   * Asset name/description
   */
  @Column({ type: 'varchar', length: 200 })
  name: string;

  /**
   * Group number for classification (1-10)
   * Based on Cuban fixed asset classification system
   */
  @Column({ type: 'integer', name: 'group_number' })
  groupNumber: number;

  /**
   * Subgroup for detailed classification
   */
  @Column({ type: 'varchar', length: 100, name: 'subgroup' })
  subgroup: string;

  /**
   * Additional subgroup detail
   */
  @Column({ type: 'varchar', length: 200, name: 'subgroup_detail', nullable: true })
  subgroupDetail: string | null;

  /**
   * Acquisition date of the asset
   */
  @Column({ type: 'date', name: 'acquisition_date' })
  acquisitionDate: Date;

  /**
   * Original acquisition value
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'acquisition_value' })
  acquisitionValue: number;

  /**
   * Annual depreciation rate percentage
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'depreciation_rate' })
  depreciationRate: number;

  /**
   * Accumulated depreciation up to report date
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'accumulated_depreciation' })
  accumulatedDepreciation: number;

  /**
   * Current book value (acquisition value - accumulated depreciation)
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'current_book_value' })
  currentBookValue: number;

  /**
   * Asset location
   */
  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null;

  /**
   * Person responsible for the asset
   */
  @Column({ type: 'varchar', length: 200, name: 'responsible_person', nullable: true })
  responsiblePerson: string | null;

  /**
   * Asset status
   */
  @Column({
    type: 'enum',
    enum: ['active', 'disposed', 'transferred', 'fully_depreciated'],
    default: 'active',
  })
  status: 'active' | 'disposed' | 'transferred' | 'fully_depreciated';

  /**
   * If disposed, the disposal date
   */
  @Column({ type: 'date', name: 'disposal_date', nullable: true })
  disposalDate: Date | null;

  /**
   * If disposed, the disposal type
   */
  @Column({ type: 'varchar', length: 50, name: 'disposal_type', nullable: true })
  disposalType: string | null;

  /**
   * Useful life in years
   */
  @Column({ type: 'integer', name: 'useful_life_years', nullable: true })
  usefulLifeYears: number | null;

  /**
   * Remaining useful life in years
   */
  @Column({ type: 'integer', name: 'remaining_useful_life', nullable: true })
  remainingUsefulLife: number | null;

  /**
   * Notes or additional information
   */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => FixedAsset)
  @JoinColumn({ name: 'asset_id' })
  asset: FixedAsset;
}
