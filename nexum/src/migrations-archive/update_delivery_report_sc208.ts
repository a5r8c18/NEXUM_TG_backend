import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDeliveryReportSC2081700000000001 implements MigrationInterface {
  name = 'UpdateDeliveryReportSC2081700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar columnas obsoletas si existen
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN IF EXISTS code`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN IF EXISTS entity`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN IF EXISTS warehouse`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN IF EXISTS document`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN IF EXISTS reason`);

    // Agregar nuevas columnas para SC-2-08
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN report_number VARCHAR(50) UNIQUE NOT NULL DEFAULT 'VE-TEMP'
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN report_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN entity_name VARCHAR(255) NOT NULL DEFAULT 'Entidad'
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN entity_nit VARCHAR(50) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN warehouse_id VARCHAR(100) NOT NULL DEFAULT 'WH-001'
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN warehouse_name VARCHAR(255) NOT NULL DEFAULT 'Almacén Principal'
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN authorization_document VARCHAR(100) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN delivered_by VARCHAR(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN received_by VARCHAR(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN received_at TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN total_amount DECIMAL(12,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN report_type VARCHAR(50) NOT NULL DEFAULT 'SC-2-08'
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN observations TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE delivery_reports 
      ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'draft'
    `);

    // Crear índices
    await queryRunner.query(`CREATE INDEX idx_delivery_reports_report_number ON delivery_reports(report_number)`);
    await queryRunner.query(`CREATE INDEX idx_delivery_reports_status ON delivery_reports(status)`);
    await queryRunner.query(`CREATE INDEX idx_delivery_reports_warehouse_id ON delivery_reports(warehouse_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.query(`DROP INDEX idx_delivery_reports_warehouse_id`);
    await queryRunner.query(`DROP INDEX idx_delivery_reports_status`);
    await queryRunner.query(`DROP INDEX idx_delivery_reports_report_number`);

    // Eliminar nuevas columnas
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN status`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN observations`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN report_type`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN total_amount`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN received_at`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN received_by`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN delivered_by`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN authorization_document`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN warehouse_name`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN warehouse_id`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN entity_nit`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN entity_name`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN report_date`);
    await queryRunner.query(`ALTER TABLE delivery_reports DROP COLUMN report_number`);

    // Restaurar columnas obsoletas
    await queryRunner.query(`ALTER TABLE delivery_reports ADD COLUMN reason TEXT NULL`);
    await queryRunner.query(`ALTER TABLE delivery_reports ADD COLUMN document VARCHAR(100) NULL`);
    await queryRunner.query(`ALTER TABLE delivery_reports ADD COLUMN warehouse VARCHAR(255) NULL`);
    await queryRunner.query(`ALTER TABLE delivery_reports ADD COLUMN entity VARCHAR(255) NULL`);
    await queryRunner.query(`ALTER TABLE delivery_reports ADD COLUMN code VARCHAR(50) NULL`);
  }
}
