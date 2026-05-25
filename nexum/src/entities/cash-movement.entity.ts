import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { CashRegister } from './cash-register.entity';
import { Payment } from './payment.entity';

@Entity('cash_movements')
export class CashMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'movement_number', type: 'varchar', length: 20, unique: true })
  movementNumber: string;

  @Column({ name: 'movement_date', type: 'timestamp' })
  movementDate: Date;

  @Column({ name: 'movement_type', type: 'varchar', length: 20 })
  movementType: 'income' | 'expense' | 'opening' | 'closing' | 'audit_adjustment';

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'balance_after', type: 'decimal', precision: 12, scale: 2 })
  balanceAfter: number;

  @Column({ name: 'description', type: 'varchar', length: 200 })
  description: string;

  @Column({ name: 'document_type', type: 'varchar', length: 30, nullable: true })
  documentType: 'recibo_cobro' | 'vale_caja' | 'arqueo' | 'apertura' | 'cierre' | 'deposito_banco' | null;

  @Column({ name: 'document_number', type: 'varchar', length: 50, nullable: true })
  documentNumber: string | null;

  @Column({ name: 'counterparty_name', type: 'varchar', length: 200, nullable: true })
  counterpartyName: string | null;

  @Column({ name: 'concept', type: 'varchar', length: 100, nullable: true })
  concept: string | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId: string | null;

  @Column({ name: 'performed_by', type: 'varchar', length: 200, nullable: true })
  performedBy: string | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 200, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'cash_register_id', type: 'uuid' })
  cashRegisterId: string;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CashRegister, (register) => register.movements)
  @JoinColumn({ name: 'cash_register_id' })
  cashRegister: CashRegister;

  @ManyToOne(() => Payment, { nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
