import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Carga inicial de AFT: activos que ya existían al empezar a usar el sistema.
 * Se guarda la fecha de la carga (la depreciación se procesa a partir del mes
 * siguiente) y la depreciación acumulada que traía el activo a esa fecha.
 */
export class AddOpeningBalanceToFixedAssets1793800000000 implements MigrationInterface {
  name = 'AddOpeningBalanceToFixedAssets1793800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE fixed_assets
         ADD COLUMN IF NOT EXISTS opening_date date NULL,
         ADD COLUMN IF NOT EXISTS opening_accumulated_depreciation numeric(12,2) NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE fixed_assets
         DROP COLUMN IF EXISTS opening_accumulated_depreciation,
         DROP COLUMN IF EXISTS opening_date`,
    );
  }
}
