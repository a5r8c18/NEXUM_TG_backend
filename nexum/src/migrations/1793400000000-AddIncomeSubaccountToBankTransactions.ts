import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Concepto 19 (Ingresos por Pago en Línea): la cuenta de ingreso queda
 * fijada en la 835 y el usuario elige la subcuenta de esa cuenta.
 */
export class AddIncomeSubaccountToBankTransactions1793400000000
  implements MigrationInterface
{
  name = 'AddIncomeSubaccountToBankTransactions1793400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions
         ADD COLUMN IF NOT EXISTS income_subaccount varchar(20) NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions DROP COLUMN IF EXISTS income_subaccount`,
    );
  }
}
