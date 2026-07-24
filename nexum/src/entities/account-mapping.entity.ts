import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';

export enum MappingType {
  INVOICE_SALE = 'invoice_sale',
  INVOICE_RECEIVABLE = 'invoice_receivable', // Débito venta a crédito: Cuentas por Cobrar
  INVOICE_PAYMENT = 'invoice_payment',
  INVOICE_CANCELLATION = 'invoice_cancellation',
  INVENTORY_ENTRY = 'inventory_entry',
  INVENTORY_EXIT = 'inventory_exit',
  INVENTORY_RETURN = 'inventory_return',
  INVENTORY_TRANSIT = 'inventory_transit', // Cuenta puente: Mercancías en tránsito / Recepción no facturada
  FIXED_ASSET_ACQUISITION = 'fixed_asset_acquisition',
  FIXED_ASSET_DEPRECIATION = 'fixed_asset_depreciation',
  FIXED_ASSET_DEPRECIATION_PRODUCTION = 'fixed_asset_depreciation_production',
  FIXED_ASSET_DEPRECIATION_ASSOCIATED = 'fixed_asset_depreciation_associated',
  FIXED_ASSET_DEPRECIATION_ADMINISTRATIVE = 'fixed_asset_depreciation_administrative',
  FIXED_ASSET_ACCUMULATED_DEPRECIATION = 'fixed_asset_accumulated_depreciation',
  FIXED_ASSET_TRANSFER = 'fixed_asset_transfer',
  FIXED_ASSET_DISPOSAL_GAIN = 'fixed_asset_disposal_gain',
  FIXED_ASSET_DISPOSAL_LOSS = 'fixed_asset_disposal_loss',
  FIXED_ASSET_SALE_PROCEEDS = 'fixed_asset_sale_proceeds',
  PAYROLL_PROCESSING = 'payroll_processing',
  PAYROLL_PROCESSING_PRODUCTION = 'payroll_processing_production',
  PAYROLL_PROCESSING_ASSOCIATED = 'payroll_processing_associated',
  PAYROLL_PROCESSING_ADMINISTRATIVE = 'payroll_processing_administrative',
  PAYROLL_PAYMENT = 'payroll_payment',
  PAYROLL_RETENTION = 'payroll_retention', // Crédito: Retenciones y deducciones por pagar
  PAYROLL_CASH = 'payroll_cash', // Crédito: cuenta de tesorería para el pago de nómina
  PURCHASE_ORDER = 'purchase_order',
  PURCHASE_PAYMENT = 'purchase_payment',
}

@Entity('account_mappings')
export class AccountMapping {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 50 })
  mappingType: MappingType;

  @Column({ type: 'varchar', length: 20 })
  accountCode: string;

  @Column({ type: 'varchar', length: 100 })
  accountName: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  defaultAccountCode?: string; // Fallback if custom mapping not found

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>; // Additional configuration

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
