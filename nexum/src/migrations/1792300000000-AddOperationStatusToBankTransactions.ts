import { MigrationInterface, QueryRunner } from 'typeorm';

/** Estado de operación (borrador/editado/confirmado) en transacciones bancarias. */
export class AddOperationStatusToBankTransactions1792300000000 implements MigrationInterface {
  name = 'AddOperationStatusToBankTransactions1792300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS operation_status varchar(15) DEFAULT 'confirmed'`,
    );
    await queryRunner.query(
      `UPDATE bank_transactions SET operation_status = 'confirmed' WHERE operation_status IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bank_transactions DROP COLUMN IF EXISTS operation_status`);
  }
}
