import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { BankAccount } from './bank-account.entity';

export type BankTransactionSourceModule =
  | 'manual'
  | 'payment'
  | 'payroll'
  | 'fixed-assets'
  | 'transfer'
  | 'reversal'
  | 'cash';

@Entity('bank_transactions')
export class BankTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_number', type: 'varchar', length: 50, unique: true })
  transactionNumber: string;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  @Column({ name: 'transaction_type', type: 'varchar', length: 20 })
  transactionType: 'debit' | 'credit' | 'transfer_in' | 'transfer_out' | 'fee' | 'interest' | 'penalty';

  /** Estado de la operación: borrador, editado, confirmado o anulado. */
  @Column({ name: 'operation_status', type: 'varchar', length: 15, default: 'confirmed' })
  operationStatus: 'draft' | 'edited' | 'confirmed' | 'cancelled';

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'CUP' })
  currency: string;

  @Column({ name: 'exchange_rate', type: 'decimal', precision: 8, scale: 4, default: 1 })
  exchangeRate: number;

  @Column({ name: 'description', type: 'varchar', length: 200 })
  description: string;

  @Column({ name: 'reference_number', type: 'varchar', length: 50, nullable: true })
  referenceNumber: string | null;

  @Column({ name: 'counterparty_name', type: 'varchar', length: 200, nullable: true })
  counterpartyName: string | null;

  @Column({ name: 'counterparty_account', type: 'varchar', length: 50, nullable: true })
  counterpartyAccount: string | null;

  @Column({ name: 'counterparty_bank', type: 'varchar', length: 100, nullable: true })
  counterpartyBank: string | null;

  /** Nombre amigable del tipo de comprobante (ej. "Transferencia Electrónica Recibida"). */
  @Column({ name: 'transaction_code', type: 'varchar', length: 100, nullable: true })
  transactionCode: string | null;

  @Column({ name: 'batch_number', type: 'varchar', length: 50, nullable: true })
  batchNumber: string | null;

  @Column({ name: 'category', type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ name: 'subcategory', type: 'varchar', length: 50, nullable: true })
  subcategory: string | null;

  @Column({ name: 'reconciled', type: 'boolean', default: false })
  reconciled: boolean;

  @Column({ name: 'reconciliation_date', type: 'date', nullable: true })
  reconciliationDate: string | null;

  @Column({ name: 'reconciliation_notes', type: 'text', nullable: true })
  reconciliationNotes: string | null;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ name: 'recurring_frequency', type: 'varchar', length: 20, nullable: true })
  recurringFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;

  @Column({ name: 'next_recurring_date', type: 'date', nullable: true })
  nextRecurringDate: string | null;

  @Column({ name: 'parent_transaction_id', type: 'uuid', nullable: true })
  parentTransactionId: string | null;

  /** Concepto 38: id del comprobante espejo registrado en la cuenta contraria. */
  @Column({ name: 'linked_transaction_id', type: 'uuid', nullable: true })
  linkedTransactionId: string | null;

  /**
   * Operación que generó el comprobante. Solo los 'manual' se editan en
   * Finanzas; se eliminan los 'manual' y los 'payment' (con reversión del
   * pago origen). El resto se anula desde su operación de origen.
   */
  @Column({ name: 'source_module', type: 'varchar', length: 30, default: 'manual' })
  sourceModule: BankTransactionSourceModule;

  /**
   * Estados previos de lo que la anulación revirtió (vouchers, pagos,
   * espejo y estado propio); permite deshacer la anulación después.
   */
  /** Anticipos (26/27): importe ya liquidado contra obligaciones del tercero. */
  @Column({ name: 'advance_applied_amount', type: 'decimal', precision: 15, scale: 2, default: 0 })
  advanceAppliedAmount: number;

  @Column({ name: 'cancel_snapshot', type: 'jsonb', nullable: true })
  cancelSnapshot: {
    prevStatus: string;
    vouchers: { id: string; status: string }[];
    payments: { id: string; vouchers: { id: string; status: string }[] }[];
    mirror?: { id: string; status: string };
  } | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'bank_account_id', type: 'uuid' })
  bankAccountId: string;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  /** Código del concepto de contrapartida elegido (FK lógica a counterpart_concepts.code). */
  @Column({ name: 'counterpart_concept_code', type: 'varchar', length: 10, nullable: true })
  counterpartConceptCode: string | null;

  /** Concepto 19 (pago en línea): cuenta de ingreso que recibe el importe bruto. */
  @Column({ name: 'income_account', type: 'varchar', length: 50, nullable: true })
  incomeAccount: string | null;

  /** Concepto 19: subcuenta de la 900 (ingreso) elegida por el usuario. */
  @Column({ name: 'income_subaccount', type: 'varchar', length: 20, nullable: true })
  incomeSubaccount: string | null;

  /** Transitorio (no persiste): nombre de la subcuenta, lo rellena la validación del 19. */
  incomeSubaccountName?: string | null;

  /** Concepto 19: importe bruto del ingreso (antes de la comisión). */
  @Column({ name: 'income_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  incomeAmount: number | null;

  /** Concepto 19: cuenta de gasto de la comisión bancaria. */
  @Column({ name: 'fee_account', type: 'varchar', length: 50, nullable: true })
  feeAccount: string | null;

  /** Concepto 19: subcuenta de la 835 (gasto/comisión) elegida por el usuario. */
  @Column({ name: 'fee_subaccount', type: 'varchar', length: 20, nullable: true })
  feeSubaccount: string | null;

  /** Transitorio (no persiste): nombre de la subcuenta de gasto. */
  feeSubaccountName?: string | null;

  /** Concepto 19: comisión descontada por el banco. */
  @Column({ name: 'fee_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  feeAmount: number | null;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}