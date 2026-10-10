import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostCenterToMovementItems1730000000000 implements MigrationInterface {
  name = 'AddCostCenterToMovementItems1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE movement_items 
      ADD COLUMN IF NOT EXISTS cost_center_id UUID
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_movement_items_cost_center 
      ON movement_items(cost_center_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_movement_items_cost_center`);
    await queryRunner.query(`ALTER TABLE movement_items DROP COLUMN IF EXISTS cost_center_id`);
  }
}
