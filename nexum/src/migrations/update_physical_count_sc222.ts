import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePhysicalCountSC2221700000000002 implements MigrationInterface {
  name = 'UpdatePhysicalCountSC2221700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar nuevas columnas para SC-2-22
    await queryRunner.query(`
      ALTER TABLE physical_counts 
      ADD COLUMN authorization_number VARCHAR(50) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE physical_counts 
      ADD COLUMN authorization_date TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE physical_counts 
      ADD COLUMN responsible_person VARCHAR(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE physical_counts 
      ADD COLUMN count_team TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE physical_counts 
      ADD COLUMN count_method VARCHAR(100) NOT NULL DEFAULT 'complete'
    `);
    await queryRunner.query(`
      ALTER TABLE physical_counts 
      ADD COLUMN count_period_start DATE NULL
    `);
    await queryRunner.query(`
      ALTER TABLE physical_counts 
      ADD COLUMN count_period_end DATE NULL
    `);

    // Crear índices
    await queryRunner.query(`CREATE INDEX idx_physical_counts_authorization_number ON physical_counts(authorization_number)`);
    await queryRunner.query(`CREATE INDEX idx_physical_counts_count_method ON physical_counts(count_method)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.query(`DROP INDEX idx_physical_counts_count_method`);
    await queryRunner.query(`DROP INDEX idx_physical_counts_authorization_number`);

    // Eliminar nuevas columnas
    await queryRunner.query(`ALTER TABLE physical_counts DROP COLUMN count_period_end`);
    await queryRunner.query(`ALTER TABLE physical_counts DROP COLUMN count_period_start`);
    await queryRunner.query(`ALTER TABLE physical_counts DROP COLUMN count_method`);
    await queryRunner.query(`ALTER TABLE physical_counts DROP COLUMN count_team`);
    await queryRunner.query(`ALTER TABLE physical_counts DROP COLUMN responsible_person`);
    await queryRunner.query(`ALTER TABLE physical_counts DROP COLUMN authorization_date`);
    await queryRunner.query(`ALTER TABLE physical_counts DROP COLUMN authorization_number`);
  }
}
