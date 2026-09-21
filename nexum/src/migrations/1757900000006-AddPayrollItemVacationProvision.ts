import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Columna vacation_provision en payroll_items. La entidad la declaró cuando se
 * introdujo la provisión de vacaciones (Art. 102, Ley 116) pero nunca llegó
 * una migración: en bases creadas solo con migraciones el INSERT fallaba con
 * "column vacation_provision does not exist".
 */
export class AddPayrollItemVacationProvision1757900000006
  implements MigrationInterface
{
  name = 'AddPayrollItemVacationProvision1757900000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payroll_items"
        ADD COLUMN IF NOT EXISTS "vacation_provision" numeric(10,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payroll_items"
        DROP COLUMN IF EXISTS "vacation_provision"
    `);
  }
}
