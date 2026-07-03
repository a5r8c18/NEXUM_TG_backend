import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceFieldsToPurchase1700000000004 implements MigrationInterface {
  name = 'AddInvoiceFieldsToPurchase1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchases 
      ADD COLUMN invoice_number VARCHAR(100) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE purchases 
      ADD COLUMN invoice_date DATE NULL
    `);
    await queryRunner.query(`
      ALTER TABLE purchases 
      ADD COLUMN is_invoiced BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Crear índices
    await queryRunner.query(`CREATE INDEX idx_purchases_invoice_number ON purchases(invoice_number)`);
    await queryRunner.query(`CREATE INDEX idx_purchases_is_invoiced ON purchases(is_invoiced)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.query(`DROP INDEX idx_purchases_is_invoiced`);
    await queryRunner.query(`DROP INDEX idx_purchases_invoice_number`);

    // Eliminar columnas
    await queryRunner.query(`ALTER TABLE purchases DROP COLUMN is_invoiced`);
    await queryRunner.query(`ALTER TABLE purchases DROP COLUMN invoice_date`);
    await queryRunner.query(`ALTER TABLE purchases DROP COLUMN invoice_number`);
  }
}
