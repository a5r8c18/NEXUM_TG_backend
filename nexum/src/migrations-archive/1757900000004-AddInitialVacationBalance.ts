import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saldo de apertura de vacaciones por trabajador: los días y el importe que
 * traía acumulados antes de la puesta en marcha del sistema. Sin él, la
 * nómina de vacaciones pagaría a la tarifa contractual y el submayor mostraría
 * cero para quienes ya tenían derecho acumulado (Arts. 102 y 52, Ley 116).
 */
export class AddInitialVacationBalance1757900000004 implements MigrationInterface {
  name = 'AddInitialVacationBalance1757900000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "initial_vacation_days" numeric(10,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "initial_vacation_amount" numeric(15,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP COLUMN IF EXISTS "initial_vacation_amount",
        DROP COLUMN IF EXISTS "initial_vacation_days"
    `);
  }
}
