import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aclara la regla del concepto 38: la contraria es la otra cuenta en la
 * misma moneda y, cuando hay más de dos cuentas en esa moneda, solo se
 * mueve entre la corriente y la de gastos (mayorista).
 */
export class ClarifyConcept38Description1793100000000
  implements MigrationInterface
{
  name = 'ClarifyConcept38Description1793100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE counterpart_concepts
          SET description = 'Traslado de fondos entre cuentas bancarias propias en la misma moneda; con más de dos cuentas solo entre la corriente y la de gastos.'
        WHERE code = '38'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE counterpart_concepts
          SET description = 'Traslado de fondos entre cuentas bancarias propias.'
        WHERE code = '38'`,
    );
  }
}
