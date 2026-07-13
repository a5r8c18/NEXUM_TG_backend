import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
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
  PAYROLL_PROCESSING = 'payroll_processing',
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

  @Column()
  companyId: number;

  @ManyToOne(() => Company)
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
