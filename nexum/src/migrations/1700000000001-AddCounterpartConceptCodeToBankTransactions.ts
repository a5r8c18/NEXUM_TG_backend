import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCounterpartConceptCodeToBankTransactions1700000000001
  implements MigrationInterface
{
  name = 'AddCounterpartConceptCodeToBankTransactions1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'bank_transactions',
      new TableColumn({
        name: 'counterpart_concept_code',
        type: 'varchar',
        length: '10',
        isNullable: true,
      }),
    );

    // FK lógica (no física, para mantener flexibilidad con el catálogo global).
    await queryRunner.query(
      `CREATE INDEX IDX_bank_transactions_concept
       ON bank_transactions (counterpart_concept_code)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_bank_transactions_concept`);
    await queryRunner.dropColumn('bank_transactions', 'counterpart_concept_code');
  }
}