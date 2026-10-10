import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant de la plataforma: la empresa "Teneduría García" (multi-company)
 * con suscripción enterprise permanente, y el superadmin vinculado a ella.
 *
 * Idempotente y tolerante a datos existentes: si la empresa ya existe
 * (p. ej. creada por el flujo de registro con otro tenant_id), la reutiliza
 * en vez de crear un duplicado.
 */
export class SeedPlatformTenant1791655000000 implements MigrationInterface {
  name = 'SeedPlatformTenant1791655000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tenantId = 'tenant-teneduria-garcia';
    const companyName = 'Teneduría García';
    const adminEmail =
      process.env.SEED_ADMIN_EMAIL || 'midas@teneduriagarcia.com';

    // 1. Empresa de la plataforma (multi-company). Si ya existe una
    //    "Teneduría García" se reutiliza su tenant_id.
    await queryRunner.query(
      `INSERT INTO "companies" ("name", "tax_id", "email", "is_active", "tenant_id", "tenant_type")
       SELECT $1::varchar, $2::varchar, $3::varchar, true, $4::varchar, 'MULTI_COMPANY'
       WHERE NOT EXISTS (
         SELECT 1 FROM "companies"
         WHERE "tenant_id" = $4::varchar OR lower("name") LIKE 'tenedur%garc%'
       )`,
      [companyName, 'TG-0001', 'info@teneduriagarcia.com', tenantId],
    );

    // 2. Suscripción enterprise permanente del tenant de la plataforma
    //    (current_period_end NULL = sin expiración).
    await queryRunner.query(
      `INSERT INTO "subscriptions" ("tenant_id", "plan", "status", "current_period_start", "price_usd", "max_users", "max_companies", "grace_period_days")
       SELECT c."tenant_id", 'enterprise', 'active', now(), '0', 50, 10, 0
       FROM "companies" c
       WHERE lower(c."name") LIKE 'tenedur%garc%'
         AND c."tenant_id" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "subscriptions" s WHERE s."tenant_id" = c."tenant_id"
         )`,
    );

    // 3. Vincular el superadmin a la empresa de la plataforma
    await queryRunner.query(
      `UPDATE "users" u
       SET "company_id" = c."id",
           "tenant_id" = c."tenant_id",
           "tenant_name" = c."name",
           "tenant_type" = 'MULTI_COMPANY'
       FROM "companies" c
       WHERE lower(c."name") LIKE 'tenedur%garc%' AND u."email" = $1`,
      [adminEmail],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const adminEmail =
      process.env.SEED_ADMIN_EMAIL || 'midas@teneduriagarcia.com';

    await queryRunner.query(
      `UPDATE "users" SET "company_id" = NULL, "tenant_id" = NULL, "tenant_name" = NULL, "tenant_type" = 'SINGLE_COMPANY' WHERE "email" = $1`,
      [adminEmail],
    );
    await queryRunner.query(
      `DELETE FROM "subscriptions" s USING "companies" c
       WHERE s."tenant_id" = c."tenant_id" AND lower(c."name") LIKE 'tenedur%garc%'`,
    );
    await queryRunner.query(
      `DELETE FROM "companies" WHERE lower("name") LIKE 'tenedur%garc%'`,
    );
  }
}
