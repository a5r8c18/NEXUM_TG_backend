import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nómina orientada a lo contable.
 *
 * 1. Tarifas de nocturnidad por empresa (Res. 17/2025 MTSS).
 *
 * 2. Subcuenta de Nóminas por Pagar asignada en la ficha y congelada en la
 *    línea. La 455 deja de traer subcuentas por categoría ocupacional: la
 *    empresa crea las que quiera. Las fichas y líneas existentes heredan la
 *    subcuenta 455-<categoría> que ya usaban, si la empresa la tiene.
 *
 * 3. Vacaciones, subsidio, maternidad y liquidación se generan por
 *    trabajador: varias nóminas del mismo concepto pueden convivir en un
 *    período. La unicidad por concepto y período queda para los conceptos
 *    colectivos (salario, pagos adicionales y libre).
 */
export class PayrollAccountingConcepts1758100000000 implements MigrationInterface {
  name = 'PayrollAccountingConcepts1758100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD COLUMN IF NOT EXISTS "night_shift_rate_evening" numeric(6,2) NOT NULL DEFAULT 0.6,
        ADD COLUMN IF NOT EXISTS "night_shift_rate_night" numeric(6,2) NOT NULL DEFAULT 1.15
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "payable_subaccount" character varying(20)
    `);
    await queryRunner.query(`
      ALTER TABLE "payroll_items"
        ADD COLUMN IF NOT EXISTS "payable_subaccount" character varying(20)
    `);

    await queryRunner.query(`
      UPDATE "employees" e
         SET "payable_subaccount" = a."code"
        FROM "accounts" a
       WHERE e."payable_subaccount" IS NULL
         AND a."companyId" = e."companyId"
         AND a."code" = '455-' || e."occupational_category"
    `);
    await queryRunner.query(`
      UPDATE "payroll_items" i
         SET "payable_subaccount" = a."code"
        FROM "accounts" a
       WHERE i."payable_subaccount" IS NULL
         AND a."companyId" = i."companyId"
         AND a."code" = '455-' || i."occupational_category"
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_payrolls_company_concept_period"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payrolls_company_concept_period"
        ON "payrolls" ("company_id", "concept", "period", COALESCE("installment", 0))
       WHERE "status" <> 'cancelled'
         AND "concept" NOT IN ('vacaciones', 'subsidio', 'maternidad', 'liquidacion')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_payrolls_company_concept_period"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payrolls_company_concept_period"
        ON "payrolls" ("company_id", "concept", "period", COALESCE("installment", 0))
       WHERE "status" <> 'cancelled'
    `);
    await queryRunner.query(
      `ALTER TABLE "payroll_items" DROP COLUMN IF EXISTS "payable_subaccount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "payable_subaccount"`,
    );
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN IF EXISTS "night_shift_rate_evening",
        DROP COLUMN IF EXISTS "night_shift_rate_night"
    `);
  }
}
