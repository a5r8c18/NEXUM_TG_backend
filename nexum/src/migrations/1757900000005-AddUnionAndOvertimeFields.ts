import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cuota sindical y recargo de horas extra en la ficha del trabajador:
 * - union_member: si está afiliado, la nómina de salario le retiene el 1 % del
 *   devengado y lo entera a la organización sindical.
 * - overtime_rate: multiplicador del salario/hora pactado en convenio
 *   colectivo (1 = tarifa base).
 */
export class AddUnionAndOvertimeFields1757900000005 implements MigrationInterface {
  name = 'AddUnionAndOvertimeFields1757900000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "union_member" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "overtime_rate" numeric(5,2) NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP COLUMN IF EXISTS "overtime_rate",
        DROP COLUMN IF EXISTS "union_member"
    `);
  }
}
