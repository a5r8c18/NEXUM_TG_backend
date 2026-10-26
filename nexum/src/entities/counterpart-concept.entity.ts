import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Catálogo GLOBAL de conceptos de contrapartida del módulo de Finanzas.
 *
 * No es multi-tenant: el catálogo es único para toda la instalación y se
 * siembra por migración con los códigos oficiales del nomenclador (20..101).
 *
 * La cuenta contable asociada a cada concepto NO se guarda aquí: es una
 * decisión por empresa (multi-tenant) y se resolverá más adelante vía
 * AccountMapping o una tabla de override. El catálogo solo describe QUÉ
 * concepto es y qué campos adicionales exige el modal.
 */
@Entity('counterpart_concepts')
export class CounterpartConcept {
  /** Código oficial ("20", "21", "101"…). */
  @PrimaryColumn({ type: 'varchar', length: 10 })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Flujo al que aplica: solo cobros, solo pagos, o ambos (caja). */
  @Column({ type: 'varchar', length: 10, default: 'both' })
  direction: 'income' | 'expense' | 'both';

  // ── Banderas que el frontend usa para decidir qué bloques pintar ──
  @Column({ name: 'requires_customer', default: false })
  requiresCustomer: boolean;

  @Column({ name: 'requires_supplier', default: false })
  requiresSupplier: boolean;

  @Column({ name: 'requires_employee', default: false })
  requiresEmployee: boolean;

  @Column({ name: 'requires_document', default: false })
  requiresDocument: boolean;

  @Column({ name: 'requires_expense_element', default: false })
  requiresExpenseElement: boolean;

  @Column({ name: 'requires_exchange_rate', default: false })
  requiresExchangeRate: boolean;

  /** Solo los activos aparecen en el selector del modal. */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Orden de aparición en el select (usamos el valor numérico del código). */
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}