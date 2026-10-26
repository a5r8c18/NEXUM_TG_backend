import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCounterpartConcepts1700000000000 implements MigrationInterface {
  name = 'CreateCounterpartConcepts1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'counterpart_concepts',
        columns: [
          { name: 'code', type: 'varchar', length: '10', isPrimary: true },
          { name: 'name', type: 'varchar', length: '150' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'direction', type: 'varchar', length: '10', default: `'both'` },
          { name: 'requires_customer', type: 'boolean', default: false },
          { name: 'requires_supplier', type: 'boolean', default: false },
          { name: 'requires_employee', type: 'boolean', default: false },
          { name: 'requires_document', type: 'boolean', default: false },
          { name: 'requires_expense_element', type: 'boolean', default: false },
          { name: 'requires_exchange_rate', type: 'boolean', default: false },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'sort_order', type: 'integer', default: 0 },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'counterpart_concepts',
      new TableIndex({
        name: 'IDX_counterpart_concepts_direction_active',
        columnNames: ['direction', 'is_active'],
      }),
    );

    // ── Seed del catálogo oficial ──
    const concepts = [
      // Ingresos
      { code: '20',  name: 'Liquidación de Oblig. de Cobros',            direction: 'income',  requiresCustomer: true,  requiresSupplier: false, requiresEmployee: false, description: 'Instrumentos de cobro (Transferencia/Recibo/Cheque) para liquidar facturas emitidas (acredita CxC).' },
      { code: '22',  name: 'Ingresos de comedores',                      direction: 'income',  requiresCustomer: true,  requiresSupplier: false, requiresEmployee: false, description: 'Recibos de Ingreso — acredita cuentas de ingresos.' },
      { code: '23',  name: 'Ingresos de cafetería',                      direction: 'income',  requiresCustomer: true,  requiresSupplier: false, requiresEmployee: false, description: 'Recibos de Ingreso — acredita cuentas de ingresos.' },
      { code: '24',  name: 'Depósito de efectivo',                       direction: 'income',  requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Depósito en Cuenta — acredita fondos de caja (efectivo).' },
      { code: '25',  name: 'Depósito de cheques',                        direction: 'income',  requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Depósito en Cuenta — acredita cheques por depositar.' },
      { code: '26',  name: 'Cobros anticipados',                         direction: 'income',  requiresCustomer: true,  requiresSupplier: false, requiresEmployee: false, description: 'Transferencia/Cheque recibido — acredita Cobros Anticipados.' },
      { code: '28',  name: 'Liquidación de Cobros Anticipados',          direction: 'income',  requiresCustomer: true,  requiresSupplier: false, requiresEmployee: false, description: 'Rebaja de Cobros Anticipados registrados previamente.' },
      { code: '33',  name: 'Ingresos financieros',                       direction: 'income',  requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Documentos de cobro — acredita ingresos financieros.' },
      { code: '46',  name: 'Liq. Oblig. por Cobrar a Trabajadores',      direction: 'income',  requiresCustomer: false, requiresSupplier: false, requiresEmployee: true,  description: 'Liquidaciones de obligaciones a/de trabajadores.' },
      { code: '49',  name: 'Liq. Oblig. por Cobrar Pend. Doc.',          direction: 'income',  requiresCustomer: true,  requiresSupplier: false, requiresEmployee: false, description: 'Liquidaciones pendientes de documentación.' },
      { code: '50',  name: 'Liquidación de Reclamaciones Recibidas',     direction: 'income',  requiresCustomer: true,  requiresSupplier: false, requiresEmployee: false, description: 'Liquidaciones de reclamaciones.' },
      { code: '80',  name: 'Efectivo Recibido de la Empresa',            direction: 'income',  requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Operaciones entre dependencias — movimientos de efectivo.' },
      { code: '81',  name: 'Efectivo Recibido de las Unidades',          direction: 'income',  requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Operaciones entre dependencias — movimientos de efectivo.' },

      // Egresos
      { code: '21',  name: 'Liquidación de Oblig. de Pagos',             direction: 'expense', requiresCustomer: false, requiresSupplier: true,  requiresEmployee: false, description: 'Instrumentos de pago (Transferencia/Cheque) para liquidar facturas recibidas (debita CxP).' },
      { code: '27',  name: 'Pagos anticipados',                          direction: 'expense', requiresCustomer: false, requiresSupplier: true,  requiresEmployee: false, description: 'Transferencia/Cheque emitido — debita Pagos Anticipados.' },
      { code: '29',  name: 'Liquidación de Pagos Anticipados',           direction: 'expense', requiresCustomer: false, requiresSupplier: true,  requiresEmployee: false, description: 'Rebaja de Pagos Anticipados registrados previamente.' },
      { code: '30',  name: 'Intereses y Comisiones Bancarias',           direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Otros pagos/Cheque/Pago automático — debita gasto financiero.' },
      { code: '31',  name: 'Oblig. con Presupuesto (no oblig.)',         direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Pago CR-09 — debita CxP de aporte sin detallar obligaciones.' },
      { code: '32',  name: 'Oblig. con Presupuesto (sí oblig.)',         direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Pago CR-09 — liquida obligaciones de aporte registradas en Cobros y Pagos.' },
      { code: '34',  name: 'Extracción de salario',                      direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Cheque emitido — debita caja (fondo Nóminas).' },
      { code: '35',  name: 'Creación de fondo pagos menores',            direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Cheque emitido — debita caja (Pagos Menores).' },
      { code: '36',  name: 'Liquidaciones de nóminas',                   direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Cheques/Otros pagos — debita Nómina por Pagar.' },
      { code: '37',  name: 'Reembolso de fondo fijo',                    direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Cheque emitido — debita fondo Pagos Menores (reembolso).' },
      { code: '40',  name: 'Ampliación del fondo fijo',                  direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Cheque emitido — debita caja (Pagos Menores).' },
      { code: '47',  name: 'Liq. Oblig. por Pagar a Trabajadores',       direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: true,  description: 'Liquidaciones de obligaciones a/de trabajadores.' },
      { code: '48',  name: 'Liq. Oblig. por Pagar Pend. Doc.',           direction: 'expense', requiresCustomer: false, requiresSupplier: true,  requiresEmployee: false, description: 'Liquidaciones pendientes de documentación.' },
      { code: '51',  name: 'Liquidación de Reclamaciones Emitidas',      direction: 'expense', requiresCustomer: false, requiresSupplier: true,  requiresEmployee: false, description: 'Liquidaciones de reclamaciones.' },
      { code: '79',  name: 'Efectivo Transferido para la Empresa',       direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Operaciones entre dependencias — movimientos de efectivo.' },
      { code: '82',  name: 'Efectivo Transferido para las Unidades',     direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Operaciones entre dependencias — movimientos de efectivo.' },
      { code: '94',  name: 'Anticipo de dietas',                         direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: true,  description: 'Modelo de Dieta — debita Anticipo a Justificar.' },
      { code: '95',  name: 'Otros anticipos o pagos menores anticipados',direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: true,  description: 'Vales de egreso / Modelo de Dieta — debita Anticipo a Justificar.' },
      { code: '98',  name: 'Pagos menores en efectivo',                  direction: 'expense', requiresCustomer: false, requiresSupplier: false, requiresEmployee: false, description: 'Vales de Egreso — debita gastos.' },

      // Ambos (caja — pueden aparecer en cualquiera de los dos flujos)
      { code: '100', name: 'Liquidación de anticipos',                   direction: 'both',    requiresCustomer: false, requiresSupplier: false, requiresEmployee: true,  description: 'Liquidación de anticipos registrados en caja.' },
      { code: '101', name: 'Liquidación de anticipos (Hoja de Gasto)',   direction: 'both',    requiresCustomer: false, requiresSupplier: false, requiresEmployee: true,  description: 'Liquidación de anticipos usando Hoja de Gasto.' },
    ];

    for (const c of concepts) {
      await queryRunner.query(
        `INSERT INTO counterpart_concepts
          (code, name, description, direction,
           requires_customer, requires_supplier, requires_employee,
           requires_document, requires_expense_element, requires_exchange_rate,
           is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (code) DO NOTHING`,
        [
          c.code, c.name, c.description, c.direction,
          c.requiresCustomer, c.requiresSupplier, c.requiresEmployee,
          false, false, false,
          true, parseInt(c.code, 10),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('counterpart_concepts', true);
  }
}