import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAreaIdToVoucherLines1755777600000 implements MigrationInterface {
  name = 'AddAreaIdToVoucherLines1755777600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voucher_lines" ADD COLUMN IF NOT EXISTS "area_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "voucher_lines" ADD CONSTRAINT "FK_voucher_lines_area_id" FOREIGN KEY ("area_id") REFERENCES "fixed_asset_areas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_voucher_lines_area_id" ON "voucher_lines" ("area_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_voucher_lines_area_id"`);
    await queryRunner.query(
      `ALTER TABLE "voucher_lines" DROP CONSTRAINT IF EXISTS "FK_voucher_lines_area_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "voucher_lines" DROP COLUMN IF EXISTS "area_id"`,
    );
  }
}
