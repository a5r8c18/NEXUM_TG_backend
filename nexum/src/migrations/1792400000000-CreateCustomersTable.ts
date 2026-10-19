import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tabla de clientes/entidades para comprobantes bancarios. */
export class CreateCustomersTable1792400000000 implements MigrationInterface {
  name = 'CreateCustomersTable1792400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id integer NOT NULL,
        name varchar(255) NOT NULL,
        tax_id varchar(50),
        phone varchar(50),
        email varchar(150),
        address text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS customers`);
  }
}
