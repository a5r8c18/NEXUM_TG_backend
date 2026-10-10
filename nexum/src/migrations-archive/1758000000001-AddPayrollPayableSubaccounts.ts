import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las subcuentas de Nóminas por Pagar (455-459) por categoría ocupacional
 * en empresas cuyo plan de cuentas ya fue sembrado sin ellas. El generador
 * `generatePayrollSubaccounts` del seed existía pero nunca se invocaba, así que
 * la 455 recibía asientos directos aun siendo agrupadora.
 */
export class AddPayrollPayableSubaccounts1758000000001
  implements MigrationInterface
{
  name = 'AddPayrollPayableSubaccounts1758000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "accounts" (
        "id", "companyId", "code", "name", "description", "type", "nature",
        "level", "group_number", "parent_code", "parent_account_id",
        "balance", "is_active", "allows_movements", "created_at", "updated_at"
      )
      SELECT
        uuid_generate_v4(), p."companyId",
        p."code" || '-' || s.sub, s.name,
        s.name || ' — ' || p."name",
        p."type", p."nature", 4, p."group_number", p."code", p."id",
        0, true, true, now(), now()
      FROM "accounts" p
      CROSS JOIN (VALUES
        ('0010', 'Dirigentes'),
        ('0020', 'Técnicos'),
        ('0030', 'Trabajadores de Servicios'),
        ('0040', 'Obreros'),
        ('0050', 'Otros Trabajadores')
      ) AS s(sub, name)
      WHERE p."code" IN ('455', '456', '457', '458', '459')
        AND NOT EXISTS (
          SELECT 1 FROM "accounts" c
           WHERE c."companyId" = p."companyId"
             AND c."code" = p."code" || '-' || s.sub
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounts"
       WHERE "code" ~ '^45[5-9]-00(10|20|30|40|50)$'
         AND "balance" = 0
    `);
  }
}
