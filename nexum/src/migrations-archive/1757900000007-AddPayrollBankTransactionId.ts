import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Relaciona cada nómina pagada con su BankTransaction real. Esto evita
 * reconstruir el referenceNumber al cancelar, que falla si el pago se
 * regeneró o el formato de referencia cambió.
 */
export class AddPayrollBankTransactionId1757900000007
  implements MigrationInterface
{
  name = 'AddPayrollBankTransactionId1757900000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payrolls"
        ADD COLUMN IF NOT EXISTS "bank_transaction_id" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payrolls"
        DROP COLUMN IF EXISTS "bank_transaction_id"
    `);
  }
}
