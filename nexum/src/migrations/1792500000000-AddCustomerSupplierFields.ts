import { MigrationInterface, QueryRunner } from 'typeorm';

/** Campos normalizados de clientes/proveedores: código consecutivo, REEUP, abreviatura, IRCC, provincia, país. */
export class AddCustomerSupplierFields1792500000000 implements MigrationInterface {
  name = 'AddCustomerSupplierFields1792500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // suppliers
    await queryRunner.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS reeup_code varchar(20)`);
    await queryRunner.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ircc varchar(50)`);

    // customers
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS code varchar(20)`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS reeup_code varchar(20)`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS abbreviation varchar(100)`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS ircc varchar(50)`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS province varchar(100)`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS country varchar(100) DEFAULT 'Cuba'`);

    // Rellenar códigos existentes y requerir el campo
    const rows: { id: string }[] = await queryRunner.query(
      `SELECT id FROM customers WHERE code IS NULL ORDER BY created_at`,
    );
    let i = 1;
    for (const row of rows) {
      await queryRunner.query(`UPDATE customers SET code = $1 WHERE id = $2`, [
        `CLE-${String(i).padStart(6, '0')}`,
        row.id,
      ]);
      i++;
    }
    await queryRunner.query(`ALTER TABLE customers ALTER COLUMN code SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_code ON customers(code)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS code`);
    await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS reeup_code`);
    await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS abbreviation`);
    await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS ircc`);
    await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS province`);
    await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS country`);
    await queryRunner.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS reeup_code`);
    await queryRunner.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS ircc`);
  }
}
