import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';
import { Employee } from './employee.entity';
import { CostCenter } from './cost-center.entity';
import { FixedAssetArea } from './fixed-asset-area.entity';

@Entity('fixed_assets')
@Index('IDX_fixed_assets_company_id', ['companyId'])
@Index('IDX_fixed_assets_status', ['status'])
@Index('IDX_fixed_assets_group', ['groupNumber'])
export class FixedAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'int', default: 0 })
  version: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'asset_code', length: 50, unique: true })
  assetCode: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'group_number', type: 'int' })
  groupNumber: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subgroup: string | null;

  @Column({
    name: 'subgroup_detail',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  subgroupDetail: string | null;

  @Column({
    name: 'depreciation_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  depreciationRate: number;

  @Column({
    name: 'acquisition_value',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  acquisitionValue: number;

  @Column({ name: 'current_value', type: 'decimal', precision: 12, scale: 2 })
  currentValue: number;

  @Column({
    name: 'accumulated_depreciation',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  accumulatedDepreciation: number;

  @Column({ name: 'acquisition_date', type: 'date' })
  acquisitionDate: string;

  @Column({ name: 'acquisition_type', type: 'varchar', length: 30, default: 'compra' })
  acquisitionType: string;

  @Column({ name: 'disposal_type', type: 'varchar', length: 30, nullable: true })
  disposalType: string | null;

  @Column({ name: 'disposal_date', type: 'date', nullable: true })
  disposalDate: string | null;

  @Column({ name: 'disposal_reason', type: 'text', nullable: true })
  disposalReason: string | null;

  // ── Faltantes/Sobrantes en investigación (Res. 235-2005 MFP) ──
  // 'shortage' → saldo pendiente en 332; 'surplus' → saldo pendiente en 555.
  @Column({ name: 'investigation_type', type: 'varchar', length: 20, nullable: true })
  investigationType: string | null;

  @Column({ name: 'investigation_status', type: 'varchar', length: 20, nullable: true })
  investigationStatus: string | null;

  @Column({
    name: 'investigation_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  investigationAmount: number | null;

  @Column({ name: 'investigation_resolution', type: 'varchar', length: 30, nullable: true })
  investigationResolution: string | null;

  @Column({ name: 'investigation_resolved_at', type: 'date', nullable: true })
  investigationResolvedAt: string | null;

  @Column({ name: 'appraisal_reference', type: 'varchar', length: 100, nullable: true })
  appraisalReference: string | null;

  // ── Superávit de revalorización acumulado en la cuenta 613 (Nomenclador 2016) ──
  // Un déficit posterior sólo puede debitarse contra 613 hasta agotar este saldo;
  // el exceso se reconoce como gasto por pérdidas (845).
  @Column({
    name: 'revaluation_surplus',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  revaluationSurplus: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ name: 'area_id', type: 'int', nullable: true })
  areaId: number | null = null;

  @ManyToOne(() => FixedAssetArea, { nullable: true })
  @JoinColumn({ name: 'area_id' })
  area: FixedAssetArea | null = null;

  @Column({
    name: 'responsible_person',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  responsiblePerson: string | null;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee | null;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId: string | null;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter: CostCenter | null;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
