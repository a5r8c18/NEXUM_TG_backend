import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Concepto 19 (Ingresos por Pago en Línea): el banco descuenta una comisión
 * del ingreso. Se guarda la cuenta e importe del ingreso bruto y la cuenta e
 * importe de la comisión; el monto del comprobante es el neto que entra al banco.
 */
export class AddOnlinePaymentFieldsToBankTransactions1792900000000 implements MigrationInterface {
  name = 'AddOnlinePaymentFieldsToBankTransactions1792900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS income_account varchar(50)`);
    await queryRunner.query(`ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS income_amount numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS fee_account varchar(50)`);
    await queryRunner.query(`ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS fee_amount numeric(12,2)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bank_transactions DROP COLUMN IF EXISTS fee_amount`);
    await queryRunner.query(`ALTER TABLE bank_transactions DROP COLUMN IF EXISTS fee_account`);
    await queryRunner.query(`ALTER TABLE bank_transactions DROP COLUMN IF EXISTS income_amount`);
    await queryRunner.query(`ALTER TABLE bank_transactions DROP COLUMN IF EXISTS income_account`);
  }
}
