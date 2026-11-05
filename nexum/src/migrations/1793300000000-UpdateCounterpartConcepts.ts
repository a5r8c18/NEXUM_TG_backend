import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo de conceptos de contrapartida:
 * - El 23 pasa a llamarse "Ingresos por ventas".
 * - Se desactivan los conceptos 25, 49, 50 y 101 de ingresos y los
 *   31, 48, 51, 95 y 101 de egresos (quedan ocultos del selector pero el
 *   histórico de comprobantes que los usó sigue mostrando su nombre).
 */
export class UpdateCounterpartConcepts1793300000000
  implements MigrationInterface
{
  name = 'UpdateCounterpartConcepts1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE counterpart_concepts SET name = 'Ingresos por ventas' WHERE code = '23'`,
    );
    await queryRunner.query(
      `UPDATE counterpart_concepts SET is_active = false
        WHERE code IN ('25', '49', '50', '31', '48', '51', '95', '101')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE counterpart_concepts SET name = 'Ingresos de cafetería' WHERE code = '23'`,
    );
    await queryRunner.query(
      `UPDATE counterpart_concepts SET is_active = true
        WHERE code IN ('25', '49', '50', '31', '48', '51', '95', '101')`,
    );
  }
}
