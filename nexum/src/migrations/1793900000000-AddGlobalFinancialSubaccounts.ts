import { MigrationInterface, QueryRunner } from 'typeorm';
import { GLOBAL_SUBACCOUNTS } from '../accounting/chart-of-accounts-2016';

/**
 * Subcuentas globales de la 835 Gastos Financieros y la 920 Ingresos
 * Financieros para todas las empresas que ya tienen el nomenclador cargado
 * (las nuevas las reciben por la semilla del plan de cuentas). Al
 * subdividirse, la cuenta padre pasa a agrupadora.
 */
export class AddGlobalFinancialSubaccounts1793900000000 implements MigrationInterface {
  name = 'AddGlobalFinancialSubaccounts1793900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [parentCode, { parentName, items }] of Object.entries(GLOBAL_SUBACCOUNTS)) {
      for (const [suffix, name] of Object.entries(items)) {
        await queryRunner.query(
          `INSERT INTO accounts (
             "companyId", code, name, description, type, nature, level, group_number,
             parent_code, parent_account_id, balance, is_active, allows_movements
           )
           SELECT p."companyId", $1::varchar, $2::varchar, $3::varchar, p.type, p.nature, 4, p.group_number,
                  p.code, p.id, 0, true, true
             FROM accounts p
            WHERE p.code = $4::varchar
              AND NOT EXISTS (
                SELECT 1 FROM accounts x WHERE x."companyId" = p."companyId" AND x.code = $1::varchar
              )`,
          [`${parentCode}-${suffix}`, name, `${name} — ${parentName}`, parentCode],
        );
      }
      await queryRunner.query(
        `UPDATE accounts SET allows_movements = false WHERE code = $1 AND allows_movements = true`,
        [parentCode],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [parentCode, { items }] of Object.entries(GLOBAL_SUBACCOUNTS)) {
      // Solo se quitan las subcuentas que nunca se usaron en un asiento.
      await queryRunner.query(
        `DELETE FROM accounts a
          WHERE a.parent_code = $1
            AND a.code = ANY($2)
            AND NOT EXISTS (SELECT 1 FROM voucher_lines vl WHERE vl.account_id = a.id)`,
        [parentCode, Object.keys(items).map((s) => `${parentCode}-${s}`)],
      );
      await queryRunner.query(
        `UPDATE accounts p SET allows_movements = true
          WHERE p.code = $1
            AND NOT EXISTS (SELECT 1 FROM accounts c WHERE c."companyId" = p."companyId" AND c.parent_code = $1)`,
        [parentCode],
      );
    }
  }
}
