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
    await queryRunner.query(`
      UPDATE "employees"
         SET "contract_term" = 'indeterminate'
       WHERE "contract_term" NOT IN ('determinate', 'indeterminate')
          OR "contract_term" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
        ALTER COLUMN "contract_type" SET DEFAULT 'work_execution'
    `);
    await queryRunner.query(`
      UPDATE "employees"
         SET "contract_type" = 'work_execution'
       WHERE "contract_type" NOT IN ('trial_period', 'work_execution')
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
