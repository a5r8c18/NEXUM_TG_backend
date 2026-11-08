import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca el origen de cada comprobante bancario (`source_module`) para que
 * Finanzas solo edite/elimine los registrados manualmente y los generados
 * por un Payment; el resto se anula desde su operación de origen. Es la
 * misma regla que aplica `vouchers.source_module` en Contabilidad.
 *
 * El backfill reclasifica los comprobantes existentes:
 *   - 'payroll'      → nómina (TXB-NOM-* / PAGO-NOM-* / categoría payroll)
 *   - 'fixed-assets' → venta o mejora de AFT (TXB-AFT-*)
 *   - 'reversal'     → reversos (parent_transaction_id o numeración REV-*)
 *   - 'payment'      → generados por un Payment (reference = PAG-*)
 *   - 'transfer'     → espejo del concepto 38 (su referencia es el número
 *                      del comprobante original)
 */
export class AddSourceModuleToBankTransactions1793600000000
  implements MigrationInterface
{
  name = 'AddSourceModuleToBankTransactions1793600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions
         ADD COLUMN IF NOT EXISTS source_module character varying(30) NOT NULL DEFAULT 'manual'`,
    );

    // Estados previos guardados al anular, para poder deshacer la anulación.
    await queryRunner.query(
      `ALTER TABLE bank_transactions
         ADD COLUMN IF NOT EXISTS cancel_snapshot jsonb NULL`,
    );

    await queryRunner.query(
      `UPDATE bank_transactions SET source_module = 'payroll'
         WHERE source_module = 'manual'
           AND (category = 'payroll'
                OR transaction_number LIKE 'TXB-NOM-%'
                OR reference_number LIKE 'PAGO-NOM-%')`,
    );

    await queryRunner.query(
      `UPDATE bank_transactions SET source_module = 'fixed-assets'
         WHERE source_module = 'manual'
           AND (category IN ('fixed-asset-sale', 'fixed-asset-improvement')
                OR transaction_number LIKE 'TXB-AFT-%')`,
    );

    await queryRunner.query(
      `UPDATE bank_transactions SET source_module = 'reversal'
         WHERE source_module = 'manual'
           AND (parent_transaction_id IS NOT NULL
                OR transaction_number LIKE 'REV-%')`,
    );

    await queryRunner.query(
      `UPDATE bank_transactions SET source_module = 'payment'
         WHERE source_module = 'manual'
           AND reference_number LIKE 'PAG-%'`,
    );

    await queryRunner.query(
      `UPDATE bank_transactions SET source_module = 'transfer'
         WHERE source_module = 'manual'
           AND counterpart_concept_code = '38'
           AND reference_number IN (
             SELECT transaction_number FROM bank_transactions bt
             WHERE bt.company_id = bank_transactions.company_id
           )`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_transactions DROP COLUMN IF EXISTS cancel_snapshot`,
    );
    await queryRunner.query(
      `ALTER TABLE bank_transactions DROP COLUMN IF EXISTS source_module`,
    );
  }
}
