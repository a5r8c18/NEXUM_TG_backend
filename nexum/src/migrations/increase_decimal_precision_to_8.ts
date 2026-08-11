import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aumenta la precisión de precios unitarios e importes a 8 decimales.
 *
 * El Costo Promedio Ponderado se redondeaba a 2 decimales, lo que provocaba
 * descuadres de céntimos al liquidar cuentas por pagar/cobrar en las
 * devoluciones: la cuenta quedaba en 'partial' en vez de 'cancelled'.
 */
export class IncreaseDecimalPrecisionTo81700000000001 implements MigrationInterface {
  name = 'IncreaseDecimalPrecisionTo81700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory_warehouse ALTER COLUMN unit_price TYPE numeric(18, 8)`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory ALTER COLUMN unit_price TYPE numeric(18, 8)`,
    );

    await queryRunner.query(
      `ALTER TABLE movements
         ALTER COLUMN unit_price TYPE numeric(18, 8),
         ALTER COLUMN total_amount TYPE numeric(20, 8)`,
    );
    await queryRunner.query(
      `ALTER TABLE movement_items
         ALTER COLUMN unit_price TYPE numeric(18, 8),
         ALTER COLUMN total_amount TYPE numeric(20, 8)`,
    );

    await queryRunner.query(
      `ALTER TABLE account_payables
         ALTER COLUMN original_amount TYPE numeric(20, 8),
         ALTER COLUMN balance_amount TYPE numeric(20, 8),
         ALTER COLUMN paid_amount TYPE numeric(20, 8),
         ALTER COLUMN last_payment_amount TYPE numeric(20, 8)`,
    );
    await queryRunner.query(
      `ALTER TABLE account_receivables
         ALTER COLUMN original_amount TYPE numeric(20, 8),
         ALTER COLUMN balance_amount TYPE numeric(20, 8),
         ALTER COLUMN paid_amount TYPE numeric(20, 8),
         ALTER COLUMN last_payment_amount TYPE numeric(20, 8)`,
    );

    // Cierra las cuentas que quedaron en 'partial' por residuos de redondeo.
    await queryRunner.query(
      `UPDATE account_payables
          SET balance_amount = 0, status = 'cancelled'
        WHERE status = 'partial' AND balance_amount > 0 AND balance_amount < 0.005`,
    );
    await queryRunner.query(
      `UPDATE account_receivables
          SET balance_amount = 0, status = 'written_off'
        WHERE status = 'partial' AND balance_amount > 0 AND balance_amount < 0.005`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reducir la escala redondea los valores existentes a 2 decimales.
    await queryRunner.query(
      `ALTER TABLE account_receivables
         ALTER COLUMN original_amount TYPE numeric(12, 2),
         ALTER COLUMN balance_amount TYPE numeric(12, 2),
         ALTER COLUMN paid_amount TYPE numeric(12, 2),
         ALTER COLUMN last_payment_amount TYPE numeric(12, 2)`,
    );
    await queryRunner.query(
      `ALTER TABLE account_payables
         ALTER COLUMN original_amount TYPE numeric(12, 2),
         ALTER COLUMN balance_amount TYPE numeric(12, 2),
         ALTER COLUMN paid_amount TYPE numeric(12, 2),
         ALTER COLUMN last_payment_amount TYPE numeric(12, 2)`,
    );
    await queryRunner.query(
      `ALTER TABLE movement_items
         ALTER COLUMN unit_price TYPE numeric(12, 2),
         ALTER COLUMN total_amount TYPE numeric(15, 2)`,
    );
    await queryRunner.query(
      `ALTER TABLE movements
         ALTER COLUMN unit_price TYPE numeric(12, 2),
         ALTER COLUMN total_amount TYPE numeric(15, 2)`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory ALTER COLUMN unit_price TYPE numeric(12, 2)`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory_warehouse ALTER COLUMN unit_price TYPE numeric(12, 2)`,
    );
  }
}
