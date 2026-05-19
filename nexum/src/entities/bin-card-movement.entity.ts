import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { BinCard } from './bin-card.entity';
import { Movement } from './movement.entity';

@Entity('bin_card_movements')
export class BinCardMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'movement_date', type: 'date' })
  movementDate: string;

  @Column({ name: 'reference_number', type: 'varchar', length: 50 })
  referenceNumber: string;

  @Column({ name: 'movement_type', type: 'varchar', length: 20 })
  movementType: 'entry' | 'exit' | 'adjustment';

  @Column({ name: 'movement_code', type: 'varchar', length: 10 })
  movementCode: string;

  @Column({ name: 'movement_description', type: 'varchar', length: 200 })
  movementDescription: string;

  @Column({ name: 'quantity_in', type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityIn: number;

  @Column({ name: 'quantity_out', type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityOut: number;

  @Column({ name: 'balance', type: 'decimal', precision: 10, scale: 2 })
  balance: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  unitPrice: number | null;

  @Column({ name: 'total_value', type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalValue: number | null;

  @Column({ name: 'entity_name', type: 'varchar', length: 200, nullable: true })
  entityName: string | null;

  @Column({ name: 'document_number', type: 'varchar', length: 50, nullable: true })
  documentNumber: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'bin_card_id', type: 'uuid' })
  binCardId: string;

  @Column({ name: 'movement_id', type: 'uuid', nullable: true })
  movementId: string | null;

  @ManyToOne(() => BinCard, binCard => binCard.movements)
  binCard: BinCard;

  @ManyToOne(() => Movement)
  movement: Movement | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
