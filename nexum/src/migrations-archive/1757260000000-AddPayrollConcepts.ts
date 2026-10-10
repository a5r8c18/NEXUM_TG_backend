import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduce el modelo de nómina por conceptos (salario, vacaciones, subsidio,
 * maternidad, paternidad y libre) conforme a la legislación laboral cubana.
 *
 * Añade a la ficha del trabajador la cuenta de gasto, la categoría ocupacional,
 * el sector de empleo y la modalidad de contrato; a las licencias los datos
 * clínicos y de maternidad que exigen los artículos 40-46 y 16-33; y a la nómina
 * el concepto, el plazo de maternidad y la trazabilidad del cálculo.
 */
export class AddPayrollConcepts1757260000000 implements MigrationInterface {
  name = 'AddPayrollConcepts1757260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── employees ──
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD COLUMN IF NOT EXISTS "expense_account_code" character varying(20),
        ADD COLUMN IF NOT EXISTS "occupational_category" character varying(4) NOT NULL DEFAULT '0020',
        ADD COLUMN IF NOT EXISTS "employment_sector" character varying(20) NOT NULL DEFAULT 'state',
        ADD COLUMN IF NOT EXISTS "contract_term" character varying(20) NOT NULL DEFAULT 'indefinite'
    `);

    // Los trabajadores existentes heredan la modalidad de contrato a partir del
    // tipo de contrato que ya tenían registrado.
    await queryRunner.query(`
      UPDATE "employees"
         SET "contract_term" = CASE
               WHEN "contractType" IN ('contractor', 'intern') THEN 'fixed_term'
               ELSE 'indefinite'
             END
    `);

    // ── leave_requests ──
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ADD COLUMN IF NOT EXISTS "origin" character varying(20),
        ADD COLUMN IF NOT EXISTS "hospitalized" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "hospitalization_start" date,
        ADD COLUMN IF NOT EXISTS "medical_certificate" character varying(100),
        ADD COLUMN IF NOT EXISTS "multiple_pregnancy" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "birth_date" date,
        ADD COLUMN IF NOT EXISTS "prenatal_start" date,
        ADD COLUMN IF NOT EXISTS "postnatal_start" date,
        ADD COLUMN IF NOT EXISTS "social_benefit_variant" character varying(1),
        ADD COLUMN IF NOT EXISTS "beneficiary_employee_id" uuid
    `);

    // Las licencias por enfermedad ya registradas se asumen de origen común, que
    // es el supuesto general del artículo 40.
    await queryRunner.query(`
      UPDATE "leave_requests" SET "origin" = 'common'
       WHERE "type" = 'sick' AND "origin" IS NULL
    `);

    // ── payrolls ──
    await queryRunner.query(`
      ALTER TABLE "payrolls"
        ADD COLUMN IF NOT EXISTS "concept" character varying(20) NOT NULL DEFAULT 'salario',
        ADD COLUMN IF NOT EXISTS "installment" smallint
    `);

    // El período deja de ser único por sí solo: ahora la unicidad es por
    // concepto, período y plazo, para admitir los tres pagos de maternidad.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payrolls_company_concept_period"
        ON "payrolls" ("company_id", "concept", "period", COALESCE("installment", 0))
       WHERE "status" <> 'cancelled'
    `);

    // ── payroll_items ──
    await queryRunner.query(`
      ALTER TABLE "payroll_items"
        ADD COLUMN IF NOT EXISTS "expense_account_code" character varying(20),
        ADD COLUMN IF NOT EXISTS "occupational_category" character varying(4) NOT NULL DEFAULT '0020',
        ADD COLUMN IF NOT EXISTS "union_dues" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "subsidy_retention" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "leave_request_id" uuid,
        ADD COLUMN IF NOT EXISTS "average_salary" numeric(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "paid_units" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "applied_rate" numeric(5,4) NOT NULL DEFAULT 0
    `);

    // Hasta ahora la cuota sindical se guardaba en healthInsurance por falta de
    // una columna propia; se traslada a union_dues y se limpia el origen.
    await queryRunner.query(`
      UPDATE "payroll_items"
         SET "union_dues" = "healthInsurance", "healthInsurance" = 0
       WHERE "healthInsurance" <> 0
    `);

    // Las líneas históricas conservan la categoría ocupacional del trabajador.
    await queryRunner.query(`
      UPDATE "payroll_items" pi
         SET "occupational_category" = e."occupational_category",
             "expense_account_code" = e."expense_account_code"
        FROM "employees" e
       WHERE e."id"::text = pi."employeeId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Se devuelve la cuota sindical a su columna original antes de eliminarla.
    await queryRunner.query(`
      UPDATE "payroll_items"
         SET "healthInsurance" = "union_dues"
       WHERE "union_dues" <> 0
    `);

    await queryRunner.query(`
      ALTER TABLE "payroll_items"
        DROP COLUMN IF EXISTS "expense_account_code",
        DROP COLUMN IF EXISTS "occupational_category",
        DROP COLUMN IF EXISTS "union_dues",
        DROP COLUMN IF EXISTS "subsidy_retention",
        DROP COLUMN IF EXISTS "leave_request_id",
        DROP COLUMN IF EXISTS "average_salary",
        DROP COLUMN IF EXISTS "paid_units",
        DROP COLUMN IF EXISTS "applied_rate"
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_payrolls_company_concept_period"`,
    );
    await queryRunner.query(`
      ALTER TABLE "payrolls"
        DROP COLUMN IF EXISTS "concept",
        DROP COLUMN IF EXISTS "installment"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP COLUMN IF EXISTS "origin",
        DROP COLUMN IF EXISTS "hospitalized",
        DROP COLUMN IF EXISTS "hospitalization_start",
        DROP COLUMN IF EXISTS "medical_certificate",
        DROP COLUMN IF EXISTS "multiple_pregnancy",
        DROP COLUMN IF EXISTS "birth_date",
        DROP COLUMN IF EXISTS "prenatal_start",
        DROP COLUMN IF EXISTS "postnatal_start",
        DROP COLUMN IF EXISTS "social_benefit_variant",
        DROP COLUMN IF EXISTS "beneficiary_employee_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
        DROP COLUMN IF EXISTS "expense_account_code",
        DROP COLUMN IF EXISTS "occupational_category",
        DROP COLUMN IF EXISTS "employment_sector",
        DROP COLUMN IF EXISTS "contract_term"
    `);
  }
}
