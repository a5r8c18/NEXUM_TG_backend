import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los comprobantes de caja se anulan (no se borran) y la anulación puede
 * deshacerse, como en Banco y Facturación. `cancel_snapshot` guarda el estado
 * previo de lo que la anulación revirtió (comprobantes contables del pago).
 */
export class AddStatusToCashMovements1794000000000 implements MigrationInterface {
  name = 'AddStatusToCashMovements1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cash_movements
         ADD COLUMN IF NOT EXISTS status character varying(20) NOT NULL DEFAULT 'active',
         ADD COLUMN IF NOT EXISTS cancel_snapshot jsonb NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cash_movements
         DROP COLUMN IF EXISTS cancel_snapshot,
         DROP COLUMN IF EXISTS status`,
    );
  }
}
