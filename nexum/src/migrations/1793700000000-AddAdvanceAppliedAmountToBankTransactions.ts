import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rastrea en cada anticipo (conceptos 26/27) cuánto ya se liquidó contra
 * cuentas por cobrar o por pagar del mismo tercero. El anticipo se consume
 * (total o parcialmente), nunca se anula ni se elimina directamente.
 */
export class AddAdvanceAppliedAmountToBankTransactions1793700000000
  implements MigrationInterface
{
  name = 'AddAdvanceAppliedAmountToBankTransactions1793700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions
         ADD COLUMN IF NOT EXISTS advance_applied_amount numeric(15,2) NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions DROP COLUMN IF EXISTS advance_applied_amount`,
    );
  }
}
