import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unicidad de partes de asistencia y de códigos de trabajador.
 *
 * Sin restricción, dos partes del mismo trabajador en el mismo día sumaban
 * dos veces sus horas extra en la nómina de salario, y dos trabajadores con
 * el mismo código rompen la identificación en la acreditación bancaria.
 *
 * - attendances: un parte por (companyId, employeeId, date). Los duplicados
 *   existentes se consolidan conservando el registro actualizado más
 *   reciente.
 * - employees: "employeeCode" único por empresa. Si ya hay códigos
 *   repetidos la migración falla con el detalle, porque renumerar un
 *   identificador de negocio sin revisión corrompería la trazabilidad.
 */
export class AttendanceEmployeeCodeUniqueness1757900000010
  implements MigrationInterface
{
  name = 'AttendanceEmployeeCodeUniqueness1757900000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Consolidar partes duplicados: se queda el actualizado más reciente.
    await queryRunner.query(`
      DELETE FROM "attendances" a
        USING "attendances" b
       WHERE a."companyId" = b."companyId"
         AND a."employeeId" = b."employeeId"
         AND a."date" = b."date"
         AND a."updatedAt" < b."updatedAt"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_attendances_company_employee_date"
        ON "attendances" ("companyId", "employeeId", "date")
    `);

    const duplicates = (await queryRunner.query(`
      SELECT "companyId", "employeeCode", COUNT(*)::int AS n
        FROM "employees"
       GROUP BY "companyId", "employeeCode"
      HAVING COUNT(*) > 1
    `)) as { companyId: number; employeeCode: string; n: number }[];

    if (duplicates.length > 0) {
      throw new Error(
        'Códigos de trabajador duplicados; corrija antes de crear el índice único: ' +
          duplicates
            .map((d) => `"${d.employeeCode}" ×${d.n} (empresa ${d.companyId})`)
            .join(', '),
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employees_company_code"
        ON "employees" ("companyId", "employeeCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_employees_company_code"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_attendances_company_employee_date"
    `);
  }
}
