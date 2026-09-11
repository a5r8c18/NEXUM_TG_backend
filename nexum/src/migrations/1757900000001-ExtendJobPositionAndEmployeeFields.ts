import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extiende el catálogo de cargos con los campos necesarios para el cálculo de
 * tasas salariales y añade a los empleados la actividad y ajusta el tipo de
 * contrato a determinado/indeterminado.
 */
export class ExtendJobPositionAndEmployeeFields1757900000001 implements MigrationInterface {
  name = 'ExtendJobPositionAndEmployeeFields1757900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_positions"
        ADD COLUMN IF NOT EXISTS "working_hours" numeric(5,2) NOT NULL DEFAULT 8
    `);
    await queryRunner.query(`
      ALTER TABLE "job_positions"
        ADD COLUMN IF NOT EXISTS "time_bank" numeric(10,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "job_positions"
        ADD COLUMN IF NOT EXISTS "time_unit" character varying(10) NOT NULL DEFAULT 'hours'
    `);
    await queryRunner.query(`
      ALTER TABLE "job_positions"
        ADD COLUMN IF NOT EXISTS "salary_rate" numeric(15,4) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "job_positions"
        ADD COLUMN IF NOT EXISTS "payment_concept" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "activity" character varying(20) NOT NULL DEFAULT 'direct'
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ALTER COLUMN "contract_type" SET DEFAULT 'indeterminate'
    `);
    await queryRunner.query(`
      UPDATE "employees"
         SET "contract_type" = 'indeterminate'
       WHERE "contract_type" NOT IN ('determinate', 'indeterminate')
          OR "contract_type" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_positions"
        DROP COLUMN IF EXISTS "payment_concept",
        DROP COLUMN IF EXISTS "salary_rate",
        DROP COLUMN IF EXISTS "time_unit",
        DROP COLUMN IF EXISTS "time_bank",
        DROP COLUMN IF EXISTS "working_hours"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP COLUMN IF EXISTS "activity"
    `);
  }
}
