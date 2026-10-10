import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normaliza el origen de la incapacidad al valor que espera el backend.
 *
 * El formulario de licencias enviaba 'work' mientras que IncapacityOrigin
 * define 'occupational' (Art. 40 Ley 105). Como el campo se persistía sin
 * validación, las licencias registradas antes de la corrección quedaron con
 * un valor que `subsidyRate()` no reconoce y que hacía caer el cálculo en la
 * rama de enfermedad común: 60 %/50 % en lugar del 80 %/70 % que corresponde
 * al accidente o enfermedad profesional.
 *
 * Además de normalizar, se añade un CHECK para que la base de datos rechace
 * cualquier valor fuera del dominio legal.
 */
export class NormalizeLeaveRequestOrigin1757900000008
  implements MigrationInterface
{
  name = 'NormalizeLeaveRequestOrigin1757900000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = (await queryRunner.query(`
      SELECT COUNT(*)::int AS count FROM "leave_requests" WHERE "origin" = 'work'
    `)) as { count: number }[];

    if (count > 0) {
      console.warn(
        `[NormalizeLeaveRequestOrigin] ${count} licencia(s) con origin='work' ` +
          "se normalizan a 'occupational'. Los subsidios ya pagados por esas " +
          'licencias se calcularon al 60 %/50 % en lugar del 80 %/70 % del ' +
          'Art. 40: revise si procede un pago complementario.',
      );
    }

    await queryRunner.query(`
      UPDATE "leave_requests" SET "origin" = 'occupational' WHERE "origin" = 'work'
    `);

    // Cualquier otro valor fuera del dominio se deja en NULL, que el servicio
    // interpreta como enfermedad común, en vez de bloquear la migración.
    await queryRunner.query(`
      UPDATE "leave_requests"
         SET "origin" = NULL
       WHERE "origin" IS NOT NULL
         AND "origin" NOT IN ('common', 'occupational')
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP CONSTRAINT IF EXISTS "CHK_leave_requests_origin"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ADD CONSTRAINT "CHK_leave_requests_origin"
        CHECK ("origin" IS NULL OR "origin" IN ('common', 'occupational'))
    `);

    // La variante de prestación social solo admite a, b o c (Art. 30.1).
    await queryRunner.query(`
      UPDATE "leave_requests"
         SET "social_benefit_variant" = NULL
       WHERE "social_benefit_variant" IS NOT NULL
         AND "social_benefit_variant" NOT IN ('a', 'b', 'c')
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP CONSTRAINT IF EXISTS "CHK_leave_requests_social_benefit_variant"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ADD CONSTRAINT "CHK_leave_requests_social_benefit_variant"
        CHECK ("social_benefit_variant" IS NULL
               OR "social_benefit_variant" IN ('a', 'b', 'c'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP CONSTRAINT IF EXISTS "CHK_leave_requests_social_benefit_variant"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP CONSTRAINT IF EXISTS "CHK_leave_requests_origin"
    `);
    await queryRunner.query(`
      UPDATE "leave_requests" SET "origin" = 'work' WHERE "origin" = 'occupational'
    `);
  }
}
