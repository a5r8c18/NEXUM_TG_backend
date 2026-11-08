import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Concepto 19 (Ingresos por Pago en Línea): la cuenta de gasto (comisión)
 * queda fijada en la 835 y el usuario elige su subcuenta.
 */
export class AddFeeSubaccountToBankTransactions1793500000000
  implements MigrationInterface
{
  name = 'AddFeeSubaccountToBankTransactions1793500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions
         ADD COLUMN IF NOT EXISTS fee_subaccount varchar(20) NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions DROP COLUMN IF EXISTS fee_subaccount`,
    );
  }
}
