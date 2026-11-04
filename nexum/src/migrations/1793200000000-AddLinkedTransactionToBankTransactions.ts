import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enlaza el par de comprobantes del concepto 38 (transferencias entre
 * cuentas propias): el original y el espejo registrado en la cuenta
 * contraria se referencian mutuamente.
 */
export class AddLinkedTransactionToBankTransactions1793200000000
  implements MigrationInterface
{
  name = 'AddLinkedTransactionToBankTransactions1793200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions
         ADD COLUMN IF NOT EXISTS linked_transaction_id uuid NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions DROP COLUMN IF EXISTS linked_transaction_id`,
    );
  }
}
