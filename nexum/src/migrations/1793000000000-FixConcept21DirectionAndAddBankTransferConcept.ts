import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - El concepto 21 (Liquidación de Oblig. de Pagos) quedó con dirección 'both'
 *   y aparecía en Ingresos: es de egresos.
 * - Nuevo concepto 38: Transferencias entre cuentas bancarias (ambas direcciones).
 */
export class FixConcept21DirectionAndAddBankTransferConcept1793000000000
  implements MigrationInterface
{
  name = 'FixConcept21DirectionAndAddBankTransferConcept1793000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE counterpart_concepts SET direction = 'expense' WHERE code = '21'`,
    );
    await queryRunner.query(
      `INSERT INTO counterpart_concepts
        (code, name, description, direction,
         requires_customer, requires_supplier, requires_employee,
         requires_document, requires_expense_element, requires_exchange_rate,
         is_active, sort_order)
       VALUES ('38', 'Transferencias entre cuentas bancarias',
               'Traslado de fondos entre cuentas bancarias propias.',
               'both', false, false, false, false, false, false, true, 38)
       ON CONFLICT (code) DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE counterpart_concepts SET direction = 'both' WHERE code = '21'`,
    );
    await queryRunner.query(`DELETE FROM counterpart_concepts WHERE code = '38'`);
  }
}
