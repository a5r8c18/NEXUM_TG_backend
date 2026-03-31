import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type JournalEntryStatus = 'draft' | 'posted' | 'cancelled';

@Entity('journal_entries')
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

  @Column()
  entryNumber: string;

  @Column({ type: 'date' })
  date: string;

  @Column()
  description: string;

  @Column()
  accountCode: string;

  @Column()
  accountName: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  credit: number;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', default: 'draft' })
  status: JournalEntryStatus;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
