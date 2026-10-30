import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normaliza el código de las subcuentas creadas manualmente al formato del
 * nomenclador (`<cuenta>-<subcuenta>`, p. ej. `110-0001`).
 *
 * Hasta ahora, al crear una subcuenta se guardaba solo lo que escribía el
 * usuario (`0001`), mientras que las del nomenclador llevan el código
 * completo. Esto hacía que se mostraran distinto y que las referencias del
 * tipo `110-0001` (p. ej. la cuenta contable vinculada a un banco) no
 * encontraran la subcuenta al contabilizar.
 *
 * Se actualizan también las referencias que guardaban el código corto:
 * partidas de comprobantes, cuentas bancarias y obligaciones por pagar.
 * Si el código normalizado ya existe en la empresa, la subcuenta se deja
 * como estaba para no generar duplicados.
 */
export class NormalizeSubaccountCodes1792700000000 implements MigrationInterface {
  name = 'NormalizeSubaccountCodes1792700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS _sub_codes;
      CREATE TEMP TABLE _sub_codes AS
      SELECT a.id,
             a."companyId" AS company_id,
             a.code AS old_code,
             a.parent_code || '-' ||
               CASE WHEN a.code ~ '^[0-9]{1,3}$' THEN lpad(a.code, 4, '0') ELSE a.code END AS new_code
      FROM accounts a
      WHERE a.level = 4
        AND COALESCE(a.parent_code, '') <> ''
        AND a.code NOT LIKE a.parent_code || '-%'
    `);

    // Evitar choques con códigos ya existentes o entre las propias subcuentas.
    await queryRunner.query(`
      DELETE FROM _sub_codes s
      WHERE EXISTS (
        SELECT 1 FROM accounts x
        WHERE x."companyId" = s.company_id AND x.code = s.new_code
      )
    `);
    await queryRunner.query(`
      DELETE FROM _sub_codes s
      USING _sub_codes t
      WHERE s.company_id = t.company_id AND s.new_code = t.new_code AND s.id > t.id
    `);

    await queryRunner.query(`
      UPDATE accounts a SET code = s.new_code
      FROM _sub_codes s WHERE a.id = s.id
    `);
    await queryRunner.query(`
      UPDATE accounts a SET parent_code = s.new_code
      FROM _sub_codes s
      WHERE a."companyId" = s.company_id AND a.parent_code = s.old_code
    `);
    await queryRunner.query(`
      UPDATE voucher_lines vl SET subaccount_code = s.new_code
      FROM _sub_codes s
      WHERE vl.account_id = s.id AND vl.subaccount_code = s.old_code
    `);
    await queryRunner.query(`
      UPDATE bank_accounts b SET accounting_account = s.new_code
      FROM _sub_codes s
      WHERE b.company_id = s.company_id AND b.accounting_account = s.old_code
    `);
    await queryRunner.query(`
      UPDATE account_payables p SET account_code = s.new_code
      FROM _sub_codes s
      WHERE p.company_id = s.company_id AND p.account_code = s.old_code
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS _sub_codes`);
  }

  async down(): Promise<void> {
    // Sin reversión: el código anterior (solo sufijo) era ambiguo y no se conserva.
  }
}
