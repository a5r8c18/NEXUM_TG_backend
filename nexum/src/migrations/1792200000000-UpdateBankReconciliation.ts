import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conciliación bancaria: número consecutivo de estado de cuenta y nuevos
 * estados (conciliado / con diferencia / con correcciones).
 */
export class UpdateBankReconciliation1792200000000 implements MigrationInterface {
  name = 'UpdateBankReconciliation1792200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_reconciliations ADD COLUMN IF NOT EXISTS statement_number varchar(30)`,
    );
    await queryRunner.query(
      `UPDATE bank_reconciliations SET status = CASE status WHEN 'completed' THEN 'reconciled' ELSE 'difference' END`,
    );
    await queryRunner.query(
      `ALTER TABLE bank_reconciliations ALTER COLUMN status SET DEFAULT 'difference'`,
    );
    // Numerar estados de cuenta existentes por empresa y fecha.
    await queryRunner.query(`
      UPDATE bank_reconciliations r SET statement_number = sub.num FROM (
        SELECT id, 'EC-' || LPAD(ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY reconciliation_date, created_at)::text, 6, '0') AS num
        FROM bank_reconciliations
      ) sub WHERE r.id = sub.id AND r.statement_number IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE bank_reconciliations SET status = CASE status WHEN 'reconciled' THEN 'completed' WHEN 'corrected' THEN 'completed' ELSE 'draft' END`,
    );
    await queryRunner.query(
      `ALTER TABLE bank_reconciliations ALTER COLUMN status SET DEFAULT 'draft'`,
    );
    await queryRunner.query(`ALTER TABLE bank_reconciliations DROP COLUMN IF EXISTS statement_number`);
  }
}
