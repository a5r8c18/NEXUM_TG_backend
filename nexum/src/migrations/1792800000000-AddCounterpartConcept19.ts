import { MigrationInterface, QueryRunner } from 'typeorm';

/** Concepto de contrapartida 19: Ingresos por Pago en Línea (ingreso, exige cliente). */
export class AddCounterpartConcept191792800000000 implements MigrationInterface {
  name = 'AddCounterpartConcept191792800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO counterpart_concepts
        (code, name, description, direction,
         requires_customer, requires_supplier, requires_employee,
         requires_document, requires_expense_element, requires_exchange_rate,
         is_active, sort_order)
       VALUES ('19', 'Ingresos por Pago en Línea',
               'Cobros recibidos mediante plataformas de pago en línea.',
               'income', true, false, false, false, false, false, true, 19)
       ON CONFLICT (code) DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM counterpart_concepts WHERE code = '19'`);
  }
}
