import { MigrationInterface, QueryRunner } from "typeorm";

export class CorrectPayrollTax440Mappings1792000151186 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // CESS retenida al trabajador -> 440-0010
        await queryRunner.query(`
            UPDATE "account_mappings"
            SET "accountCode" = '440-0010',
                "accountName" = 'Contribución Especial a la Seguridad Social - Obligaciones con el Presupuesto'
            WHERE "mappingType" = 'payroll_retention'
        `);

        // UFT 5 % -> 440-0006
        await queryRunner.query(`
            UPDATE "account_mappings"
            SET "accountCode" = '440-0006',
                "accountName" = 'Impuesto por Utilización de la Fuerza de Trabajo - Obligaciones con el Presupuesto'
            WHERE "mappingType" = 'payroll_labor_force_tax'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "account_mappings"
            SET "accountCode" = '440-0008',
                "accountName" = 'Contribuciones - Obligaciones con el Presupuesto'
            WHERE "mappingType" = 'payroll_retention'
        `);

        await queryRunner.query(`
            UPDATE "account_mappings"
            SET "accountCode" = '440-0007',
                "accountName" = 'Otros Impuestos - Obligaciones con el Presupuesto'
            WHERE "mappingType" = 'payroll_labor_force_tax'
        `);
    }

}
