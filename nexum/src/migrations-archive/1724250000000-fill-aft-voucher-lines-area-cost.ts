import { MigrationInterface, QueryRunner } from 'typeorm';

export class FillAftVoucherLinesAreaCost1724250000000
  implements MigrationInterface
{
  name = 'FillAftVoucherLinesAreaCost1724250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rellena area_id y cost_center_id de las líneas de comprobantes generados
    // por el módulo de activos fijos a partir de los datos del propio activo.
    await queryRunner.query(`
      UPDATE voucher_lines vl
      SET
        area_id = fa.area_id,
        cost_center_id = fa.cost_center_id
      FROM vouchers v
      JOIN fixed_assets fa
        ON fa.id = CAST(v.source_document_id AS INTEGER)
      WHERE v.source_module = 'fixed-assets'
        AND v.source_document_id IS NOT NULL
        AND vl.voucher_id = v.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE voucher_lines vl
      SET
        area_id = NULL,
        cost_center_id = NULL
      FROM vouchers v
      WHERE v.source_module = 'fixed-assets'
        AND vl.voucher_id = v.id
    `);
  }
}
