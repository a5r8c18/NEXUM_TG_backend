import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Consecutivo de documentos por empresa, ámbito y año.
 *
 * Garantiza numeración única, consecutiva e ininterrumpida para facturas,
 * comprobantes, cuentas por cobrar/pagar, pagos y demás documentos, con
 * incremento atómico a nivel de base de datos (a diferencia de contar filas,
 * que produce duplicados ante borrados o concurrencia).
 */
@Entity('document_sequences')
@Index('UQ_document_sequences_scope', ['companyId', 'scope', 'year'], {
  unique: true,
})
export class DocumentSequence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  /** Ámbito del consecutivo: 'invoice', 'voucher:FAC', 'payment', etc. */
  @Column({ type: 'varchar', length: 60 })
  scope: string;

  /** Año al que pertenece la serie. 0 = serie continua sin reinicio anual. */
  @Column({ type: 'integer', default: 0 })
  year: number;

  @Column({ name: 'last_number', type: 'integer', default: 0 })
  lastNumber: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
