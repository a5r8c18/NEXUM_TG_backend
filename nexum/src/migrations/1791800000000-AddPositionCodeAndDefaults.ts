import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade el campo código a los cargos y ajusta la precisión de la jornada
 * para soportar 7,9416 h. Los valores por defecto reflejan la jornada
 * estándar y el fondo de tiempo mensual en horas.
 */
export class AddPositionCodeAndDefaults1791800000000 implements MigrationInterface {
  name = 'AddPositionCodeAndDefaults1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_positions" ADD COLUMN "code" character varying(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_positions" ALTER COLUMN "working_hours" TYPE numeric(6,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_positions" ALTER COLUMN "working_hours" SET DEFAULT 7.9416`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_positions" ALTER COLUMN "time_bank" SET DEFAULT 190.6`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_positions" ALTER COLUMN "time_bank" SET DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_positions" ALTER COLUMN "working_hours" SET DEFAULT 8`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_positions" ALTER COLUMN "working_hours" TYPE numeric(5,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_positions" DROP COLUMN "code"`,
    );
  }
}
