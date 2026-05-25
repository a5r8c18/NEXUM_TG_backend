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
import { FixedAsset } from './fixed-asset.entity';

/**
 * DepreciationHistory Entity
 * 
 * Tracks the depreciation history for each fixed asset over time.
 * Required by Resolution 340 for audit trail and compliance with Cuban accounting standards.
 * 
 * Resolución 340 del Ministerio de Finanzas y Precios (2004):
 * - Sistema debe mantener historial completo de depreciaciones
 * - Trazabilidad de todos los cambios en valores contables
 * - Auditoría de operaciones sobre activos fijos
 */
@Entity('depreciation_history')
@Index(['assetId'])
@Index(['companyId'])
@Index(['year', 'month'])
export class DepreciationHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'asset_id' })
  assetId: number;

  @Column({ type: 'integer' })
  year: number;

  @Column({ type: 'integer' })
  month: number;

  /**
   * Monthly depreciation amount for this period
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'monthly_depreciation' })
  monthlyDepreciation: number;

  /**
   * Total accumulated depreciation up to this period
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'accumulated_depreciation' })
  accumulatedDepreciation: number;

  /**
   * Current book value after depreciation
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'current_value' })
  currentValue: number;

  /**
   * Depreciation rate used for this calculation
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'depreciation_rate' })
  depreciationRate: number;

  /**
   * Reference to the accounting voucher generated for this depreciation
   */
  @Column({ name: 'voucher_reference', nullable: true })
  voucherReference: string | null;

  /**
   * Processing status
   */
  @Column({
    type: 'enum',
    enum: ['pending', 'processed', 'error'],
    default: 'processed',
  })
  status: 'pending' | 'processed' | 'error';

  /**
   * Error message if processing failed
   */
  @Column({ name: 'error_message', nullable: true, type: 'text' })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => FixedAsset)
  @JoinColumn({ name: 'asset_id' })
  asset: FixedAsset;
}
