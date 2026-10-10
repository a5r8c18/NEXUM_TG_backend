import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea el catálogo de cargos de la plantilla y lo enlaza con las fichas de
 * trabajador y los contratos.
 *
 * Hasta ahora el cargo se escribía como texto libre en cada ficha, lo que
 * impedía normalizar denominaciones y fijar un salario por plaza. La migración
 * no descarta esos datos: crea un cargo por cada denominación distinta ya
 * registrada, toma como salario de referencia el salario medio de quienes lo
 * ocupan y enlaza las filas existentes. La columna de texto "position" se
 * conserva como denominación denormalizada, igual que "departmentName".
 */
export class AddJobPositions1757900000000 implements MigrationInterface {
  name = 'AddJobPositions1757900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_positions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" integer NOT NULL,
        "name" character varying(150) NOT NULL,
        "description" character varying(255),
        "base_salary" numeric(15,2) NOT NULL DEFAULT 0,
        "department_id" uuid,
        "department_name" character varying(150),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_positions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_positions_company_name"
        ON "job_positions" ("company_id", "name")
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "position_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        ADD COLUMN IF NOT EXISTS "position_id" uuid
    `);

    // Un cargo por cada denominación distinta ya registrada en las fichas, con
    // el salario medio de sus ocupantes como referencia inicial.
    await queryRunner.query(`
      INSERT INTO "job_positions" ("company_id", "name", "base_salary", "description")
      SELECT e."companyId",
             btrim(e."position"),
             ROUND(AVG(COALESCE(e."salary", 0)), 2),
             'Cargo creado automáticamente a partir de las fichas existentes'
        FROM "employees" e
       WHERE e."position" IS NOT NULL
         AND btrim(e."position") <> ''
       GROUP BY e."companyId", btrim(e."position")
      ON CONFLICT ("company_id", "name") DO NOTHING
    `);

    // Los contratos pueden mencionar cargos que ninguna ficha usa ya.
    await queryRunner.query(`
      INSERT INTO "job_positions" ("company_id", "name", "base_salary", "description")
      SELECT c."companyId",
             btrim(c."position"),
             ROUND(AVG(COALESCE(c."salary", 0)), 2),
             'Cargo creado automáticamente a partir de los contratos existentes'
        FROM "employee_contracts" c
       WHERE c."position" IS NOT NULL
         AND btrim(c."position") <> ''
       GROUP BY c."companyId", btrim(c."position")
      ON CONFLICT ("company_id", "name") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "employees" e
         SET "position_id" = p."id"
        FROM "job_positions" p
       WHERE p."company_id" = e."companyId"
         AND p."name" = btrim(e."position")
         AND e."position_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "employee_contracts" c
         SET "position_id" = p."id"
        FROM "job_positions" p
       WHERE p."company_id" = c."companyId"
         AND p."name" = btrim(c."position")
         AND c."position_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // La denominación textual del cargo sobrevive en "position", de modo que
    // revertir no pierde información.
    await queryRunner.query(`
      ALTER TABLE "employee_contracts" DROP COLUMN IF EXISTS "position_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees" DROP COLUMN IF EXISTS "position_id"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_job_positions_company_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_positions"`);
  }
}
