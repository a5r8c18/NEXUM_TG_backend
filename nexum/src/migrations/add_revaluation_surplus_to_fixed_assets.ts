import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Superávit de revalorización acumulado por activo fijo (cuenta 613 del
 * Nomenclador de Cuentas 2016 — Revalorización de Activos Fijos Tangibles).
 *
 * Permite limitar el débito de un déficit de revalorización al superávit
 * previamente acreditado del mismo activo; el exceso debe reconocerse como
 * gasto por pérdidas (cuenta 845).
 */
export class AddRevaluationSurplusToFixedAssets1755500000000
  implements MigrationInterface
{
  name = 'AddRevaluationSurplusToFixedAssets1755500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fixed_assets
      ADD COLUMN IF NOT EXISTS revaluation_surplus NUMERIC(12,2) NOT NULL DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fixed_assets
      DROP COLUMN IF EXISTS revaluation_surplus;
    `);
  }
}
