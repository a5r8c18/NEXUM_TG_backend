import { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade el fondo y la cuenta contable a las cuentas bancarias. */
export class AddFondoToBankAccounts1792100000000 implements MigrationInterface {
  name = 'AddFondoToBankAccounts1792100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS fondo varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS accounting_account varchar(50)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bank_accounts DROP COLUMN IF EXISTS accounting_account`);
    await queryRunner.query(`ALTER TABLE bank_accounts DROP COLUMN IF EXISTS fondo`);
  }
}
