import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fondo de caja:
 * - Tasa de cambio, fecha de apertura y los saldos de caja (CUP) y de libros.
 * - El responsable deja de ser obligatorio.
 */
export class AddCashFundFields1794200000000 implements MigrationInterface {
  name = 'AddCashFundFields1794200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cash_registers
         ADD COLUMN IF NOT EXISTS exchange_rate numeric(12,4) NOT NULL DEFAULT 1,
         ADD COLUMN IF NOT EXISTS opening_date date NULL,
         ADD COLUMN IF NOT EXISTS cash_balance_cup numeric(14,2) NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS book_opening_balance numeric(14,2) NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS book_balance numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE cash_registers ALTER COLUMN responsible_name DROP NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE cash_registers SET responsible_name = '' WHERE responsible_name IS NULL`);
    await queryRunner.query(`ALTER TABLE cash_registers ALTER COLUMN responsible_name SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE cash_registers
         DROP COLUMN IF EXISTS book_balance,
         DROP COLUMN IF EXISTS book_opening_balance,
         DROP COLUMN IF EXISTS cash_balance_cup,
         DROP COLUMN IF EXISTS opening_date,
         DROP COLUMN IF EXISTS exchange_rate`,
    );
  }
}
