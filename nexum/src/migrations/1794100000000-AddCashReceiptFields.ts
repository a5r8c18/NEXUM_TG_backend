import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recibo de ingreso de caja:
 * - Cada caja tiene su fondo en efectivo y la cuenta contable (101-108,
 *   con subcuenta) que se debita al cobrar.
 * - El movimiento guarda los datos del recibo: tasa, número, entregado por,
 *   fecha de emisión, recibido por y la cuenta de contrapartida (con su
 *   subcuenta) que se acredita en el asiento.
 */
export class AddCashReceiptFields1794100000000 implements MigrationInterface {
  name = 'AddCashReceiptFields1794100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cash_registers
         ADD COLUMN IF NOT EXISTS fondo character varying(100) NULL,
         ADD COLUMN IF NOT EXISTS accounting_account character varying(50) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE cash_movements
         ADD COLUMN IF NOT EXISTS exchange_rate numeric(12,4) NOT NULL DEFAULT 1,
         ADD COLUMN IF NOT EXISTS receipt_number character varying(50) NULL,
         ADD COLUMN IF NOT EXISTS delivered_by character varying(200) NULL,
         ADD COLUMN IF NOT EXISTS issue_date date NULL,
         ADD COLUMN IF NOT EXISTS received_by character varying(200) NULL,
         ADD COLUMN IF NOT EXISTS counterpart_account character varying(50) NULL,
         ADD COLUMN IF NOT EXISTS counterpart_subaccount character varying(50) NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cash_movements
         DROP COLUMN IF EXISTS counterpart_subaccount,
         DROP COLUMN IF EXISTS counterpart_account,
         DROP COLUMN IF EXISTS received_by,
         DROP COLUMN IF EXISTS issue_date,
         DROP COLUMN IF EXISTS delivered_by,
         DROP COLUMN IF EXISTS receipt_number,
         DROP COLUMN IF EXISTS exchange_rate`,
    );
    await queryRunner.query(
      `ALTER TABLE cash_registers
         DROP COLUMN IF EXISTS accounting_account,
         DROP COLUMN IF EXISTS fondo`,
    );
  }
}
