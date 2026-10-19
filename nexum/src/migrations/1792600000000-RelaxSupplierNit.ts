import { MigrationInterface, QueryRunner } from 'typeorm';

/** NIT del proveedor pasa a opcional (permite creación rápida solo con nombre). */
export class RelaxSupplierNit1792600000000 implements MigrationInterface {
  name = 'RelaxSupplierNit1792600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN nit DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS "UQ_suppliers_nit"`);
    await queryRunner.query(`ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_nit_key`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_suppliers_nit`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN nit SET NOT NULL`);
  }
}
