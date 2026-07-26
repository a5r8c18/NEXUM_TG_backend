import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryTransitAccount1700000000005 implements MigrationInterface {
  name = 'AddInventoryTransitAccount1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // No-op: la cuenta 189-01 no forma parte del Nomenclador Cubano 2016.
    // La recepción sin factura se contabiliza mediante la cuenta 434 del pasivo.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op revert.
  }
}
