import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeliveryInformSC2181700000000003 implements MigrationInterface {
  name = 'CreateDeliveryInformSC2181700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE delivery_informs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL,
        inform_number VARCHAR(50) UNIQUE NOT NULL,
        inform_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        entity_name VARCHAR(255) NOT NULL,
        entity_nit VARCHAR(50) NULL,
        entity_address VARCHAR(500) NULL,
        warehouse_id VARCHAR(100) NOT NULL,
        warehouse_name VARCHAR(255) NOT NULL,
        delivery_report_id VARCHAR(100) NULL,
        delivery_report_number VARCHAR(50) NULL,
        products TEXT NOT NULL,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        purpose VARCHAR(255) NULL,
        observations TEXT NULL,
        prepared_by VARCHAR(255) NULL,
        approved_by VARCHAR(255) NULL,
        approved_at TIMESTAMP NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_delivery_informs_company FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // Crear índices
    await queryRunner.query(`CREATE INDEX idx_delivery_informs_company_id ON delivery_informs(company_id)`);
    await queryRunner.query(`CREATE INDEX idx_delivery_informs_inform_number ON delivery_informs(inform_number)`);
    await queryRunner.query(`CREATE INDEX idx_delivery_informs_status ON delivery_informs(status)`);
    await queryRunner.query(`CREATE INDEX idx_delivery_informs_warehouse_id ON delivery_informs(warehouse_id)`);
    await queryRunner.query(`CREATE INDEX idx_delivery_informs_delivery_report_id ON delivery_informs(delivery_report_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.query(`DROP INDEX idx_delivery_informs_delivery_report_id`);
    await queryRunner.query(`DROP INDEX idx_delivery_informs_warehouse_id`);
    await queryRunner.query(`DROP INDEX idx_delivery_informs_status`);
    await queryRunner.query(`DROP INDEX idx_delivery_informs_inform_number`);
    await queryRunner.query(`DROP INDEX idx_delivery_informs_company_id`);

    // Eliminar tabla
    await queryRunner.query(`DROP TABLE delivery_informs`);
  }
}
