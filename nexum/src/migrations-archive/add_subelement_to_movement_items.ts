import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubelementToMovementItems1700000000000 implements MigrationInterface {
  name = 'AddSubelementToMovementItems1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE movement_items 
      ADD COLUMN subelement_id UUID NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_movement_items_subelement_id ON movement_items(subelement_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_movement_items_subelement_id;
    `);

    await queryRunner.query(`
      ALTER TABLE movement_items 
      DROP COLUMN subelement_id;
    `);
  }
}
