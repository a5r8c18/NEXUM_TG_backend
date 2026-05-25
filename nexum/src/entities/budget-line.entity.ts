import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Budget } from './budget.entity';

@Entity('budget_lines')
export class BudgetLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'budget_id', type: 'uuid' })
  budgetId: string;

  @ManyToOne(() => Budget, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'budget_id' })
  budget: Budget;

  @Column({ name: 'account_code', type: 'varchar', length: 20 })
  accountCode: string;

  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName: string;

  @Column({ type: 'integer', nullable: true })
  month: number | null;

  @Column({ name: 'planned_amount', type: 'decimal', precision: 15, scale: 2, default: 0 })
  plannedAmount: number;

  @Column({ name: 'actual_amount', type: 'decimal', precision: 15, scale: 2, default: 0 })
  actualAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  deviation: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
