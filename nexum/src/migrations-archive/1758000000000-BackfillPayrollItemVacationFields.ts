import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill de las columnas de provisión de vacaciones (Art. 102, Ley 116) que
 * se crearon con DEFAULT 0 sin cargar el histórico:
 *  - vacation_days (AddHrReportFields)
 *  - vacation_provision (AddPayrollItemVacationProvision)
 *
 * Se deriva de paid_units y gross_salary con la misma tasa del motor de
 * nómina (9,09 % ≈ 1 día por cada 11 trabajados) y solo para nóminas de
 * concepto 'salario', que es donde el servicio las calcula. Solo toca filas
 * en 0: los valores ya registrados no se sobrescriben.
 */
export class BackfillPayrollItemVacationFields1758000000000
  implements MigrationInterface
{
  name = 'BackfillPayrollItemVacationFields1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "payroll_items" pi
         SET "vacation_days" = ROUND(pi."paid_units" * 0.0909, 2)
        FROM "payrolls" p
       WHERE pi."payrollId" = p."id"
         AND p."concept" = 'salario'
         AND pi."vacation_days" = 0
         AND pi."paid_units" > 0
    `);
    await queryRunner.query(`
      UPDATE "payroll_items" pi
         SET "vacation_provision" = ROUND(pi."grossSalary" * 0.0909, 2)
        FROM "payrolls" p
       WHERE pi."payrollId" = p."id"
         AND p."concept" = 'salario'
         AND pi."vacation_provision" = 0
         AND pi."grossSalary" > 0
    `);
  }

  public async down(): Promise<void> {
    // Irreversible a propósito: revertir pondría en 0 datos que ahora
    // representan un derecho adquirido del trabajador.
  }
}
