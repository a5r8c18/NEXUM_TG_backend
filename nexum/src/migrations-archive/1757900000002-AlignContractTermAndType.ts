import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajusta los catálogos de término y tipo de contrato según la nueva
 * clasificación:
 *  - Término: Determinado / Indeterminado
 *  - Tipo:    Período a pruebas / Ejecución de obras
 */
export class AlignContractTermAndType1757900000002 implements MigrationInterface {
  name = 'AlignContractTermAndType1757900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
        ALTER COLUMN "contract_term" SET DEFAULT 'indeterminate'
    `);
    // Preserva la modalidad: 'fixed_term' (contratados y becarios que cargó
    // AddPayrollConcepts) equivale a 'determinate'. Reescribir todo a
    // 'indeterminate' perdería el término que limita la duración del subsidio.
    await queryRunner.query(`
      UPDATE "employees"
         SET "contract_term" = CASE
               WHEN "contract_term" = 'fixed_term' THEN 'determinate'
               WHEN "contract_term" IN ('determinate', 'indeterminate')
                 THEN "contract_term"
               ELSE 'indeterminate'
             END
    `);

    // El vínculo por defecto es el ordinario; solo quien fue 'trial_period' o
    // 'work_execution' conserva su modalidad. Convertir todo a
    // 'work_execution' marcaba como ejecución de obra a contratos comunes.
    await queryRunner.query(`
      ALTER TABLE "employees"
        ALTER COLUMN "contract_type" SET DEFAULT 'ordinary'
    `);
    await queryRunner.query(`
      UPDATE "employees"
         SET "contract_type" = 'ordinary'
       WHERE "contract_type" NOT IN ('ordinary', 'trial_period', 'work_execution')
          OR "contract_type" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
        ALTER COLUMN "contract_term" SET DEFAULT 'indefinite'
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ALTER COLUMN "contract_type" SET DEFAULT 'full_time'
    `);
  }
}
