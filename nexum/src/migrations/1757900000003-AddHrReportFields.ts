import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Campos que alimentan los reportes de recursos humanos: las plazas aprobadas
 * del cargo (plantilla aprobada frente a cubierta) y los datos bancarios del
 * trabajador (fichero de acreditación salarial).
 */
export class AddHrReportFields1757900000003 implements MigrationInterface {
  name = 'AddHrReportFields1757900000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_positions"
        ADD COLUMN IF NOT EXISTS "approved_count" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "bank_name" character varying(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "bank_account" character varying(40)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP COLUMN IF EXISTS "bank_account",
        DROP COLUMN IF EXISTS "bank_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "job_positions"
        DROP COLUMN IF EXISTS "approved_count"
    `);
  }
}
