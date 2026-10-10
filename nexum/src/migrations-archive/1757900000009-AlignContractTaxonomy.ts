import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Alinea la taxonomía de contratos con el Art. 24 de la Ley 116.
 *
 * `employee_contracts.contract_type` usaba una taxonomía ajena
 * ('full_time', 'part_time', 'contractor', 'intern') y el DTO aceptaba
 * cualquier cadena. Se sustituye por el mismo modelo de dos ejes que ya
 * tiene `employees`: `contractTerm` (determinate|indeterminate, la duración
 * del Art. 24 que gobierna los límites del subsidio) y `contractType`
 * (ordinary|trial_period|work_execution, la modalidad). Se añade 'ordinary'
 * para el vínculo ordinario —incluido el indeterminado— que antes se
 * registraba contradictoriamente como 'work_execution'.
 *
 * En `employees` la columna viva es "contractType" (camelCase); la
 * snake_case `contract_type` que creó una migración anterior nunca fue
 * mapeada por la entidad y se elimina.
 */
export class AlignContractTaxonomy1757900000009 implements MigrationInterface {
  name = 'AlignContractTaxonomy1757900000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── employees."contractType" → modalidad Ley 116 ──
    // 'contractor' (contratado por obra) ≈ ejecución de trabajo u obra;
    // 'intern' ≈ contrato a prueba; el resto de valores ajenos quedan en
    // 'ordinary', que también cubre el vínculo indeterminado.
    await queryRunner.query(`
      UPDATE "employees" SET "contractType" = 'work_execution' WHERE "contractType" = 'contractor'
    `);
    await queryRunner.query(`
      UPDATE "employees" SET "contractType" = 'trial_period' WHERE "contractType" = 'intern'
    `);
    await queryRunner.query(`
      UPDATE "employees"
         SET "contractType" = 'ordinary'
       WHERE "contractType" IS NULL
          OR "contractType" NOT IN ('ordinary', 'trial_period', 'work_execution')
    `);
    // Un contrato indeterminado no puede ser de ejecución de obra: los
    // registros que quedaron en ese estado contradictorio pasan a 'ordinary'.
    await queryRunner.query(`
      UPDATE "employees"
         SET "contractType" = 'ordinary'
       WHERE "contract_term" = 'indeterminate'
         AND "contractType" IN ('trial_period', 'work_execution')
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ALTER COLUMN "contractType" SET DEFAULT 'ordinary'
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP CONSTRAINT IF EXISTS "CHK_employees_contract_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD CONSTRAINT "CHK_employees_contract_type"
        CHECK ("contractType" IN ('ordinary', 'trial_period', 'work_execution'))
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP CONSTRAINT IF EXISTS "CHK_employees_contract_term"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD CONSTRAINT "CHK_employees_contract_term"
        CHECK ("contract_term" IN ('determinate', 'indeterminate'))
    `);

    // Columna snake_case que nunca fue mapeada por la entidad.
    await queryRunner.query(`
      ALTER TABLE "employees" DROP COLUMN IF EXISTS "contract_type"
    `);

    // ── employee_contracts: mismo modelo de dos ejes ──
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        ADD COLUMN IF NOT EXISTS "contract_term" character varying(20)
        NOT NULL DEFAULT 'indeterminate'
    `);
    await queryRunner.query(`
      UPDATE "employee_contracts"
         SET "contract_term" = 'determinate', "contractType" = 'work_execution'
       WHERE "contractType" = 'contractor'
    `);
    await queryRunner.query(`
      UPDATE "employee_contracts"
         SET "contract_term" = 'determinate', "contractType" = 'trial_period'
       WHERE "contractType" = 'intern'
    `);
    await queryRunner.query(`
      UPDATE "employee_contracts"
         SET "contract_term" = 'determinate', "contractType" = 'ordinary'
       WHERE "contractType" = 'part_time'
    `);
    await queryRunner.query(`
      UPDATE "employee_contracts"
         SET "contract_term" = 'indeterminate', "contractType" = 'ordinary'
       WHERE "contractType" = 'full_time'
          OR "contractType" IS NULL
          OR "contractType" NOT IN ('ordinary', 'trial_period', 'work_execution')
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        ALTER COLUMN "contractType" SET DEFAULT 'ordinary'
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        DROP CONSTRAINT IF EXISTS "CHK_employee_contracts_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        ADD CONSTRAINT "CHK_employee_contracts_type"
        CHECK ("contractType" IN ('ordinary', 'trial_period', 'work_execution'))
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        DROP CONSTRAINT IF EXISTS "CHK_employee_contracts_term"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        ADD CONSTRAINT "CHK_employee_contracts_term"
        CHECK ("contract_term" IN ('determinate', 'indeterminate'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        DROP CONSTRAINT IF EXISTS "CHK_employee_contracts_term"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_contracts"
        DROP CONSTRAINT IF EXISTS "CHK_employee_contracts_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_contracts" DROP COLUMN IF EXISTS "contract_term"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP CONSTRAINT IF EXISTS "CHK_employees_contract_term"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP CONSTRAINT IF EXISTS "CHK_employees_contract_type"
    `);
  }
}
