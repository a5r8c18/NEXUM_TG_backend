import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdatePayrollTax440Mappings1791999444045 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // CESS retenida al trabajador: 440-0008 -> 440-0006
        await queryRunner.query(`
            UPDATE "account_mappings"
            SET "accountCode" = '440-0006',
                "accountName" = 'Contribución Especial a la Seguridad Social - Obligaciones con el Presupuesto'
            WHERE "mappingType" = 'payroll_retention' AND "accountCode" = '440-0008'
        `);

        // UFT: 440-0007 -> 440-0010
        await queryRunner.query(`
            UPDATE "account_mappings"
            SET "accountCode" = '440-0010',
                "accountName" = 'Impuesto por Utilización de la Fuerza de Trabajo - Obligaciones con el Presupuesto'
            WHERE "mappingType" = 'payroll_labor_force_tax' AND "accountCode" = '440-0007'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "account_mappings"
            SET "accountCode" = '440-0008',
                "accountName" = 'Contribuciones - Obligaciones con el Presupuesto'
            WHERE "mappingType" = 'payroll_retention' AND "accountCode" = '440-0006'
        `);

        await queryRunner.query(`
            UPDATE "account_mappings"
            SET "accountCode" = '440-0007',
                "accountName" = 'Otros Impuestos - Obligaciones con el Presupuesto'
            WHERE "mappingType" = 'payroll_labor_force_tax' AND "accountCode" = '440-0010'
        `);
    }

}
