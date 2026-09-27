import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Autorización expresa de adelanto de vacaciones.
 *
 * Hasta aquí una licencia de vacaciones se aprobaba sin comprobar el saldo del
 * submayor: el trabajador podía salir por más días de los devengados y la
 * nómina se limitaba a avisar, dejando la provisión 492 en débito. La
 * aprobación ahora exige saldo suficiente y solo admite el exceso cuando se
 * marca como adelanto, que queda registrado en la propia licencia.
 *
 * Las licencias ya aprobadas se marcan como adelanto autorizado: se aprobaron
 * bajo la regla anterior y anularlas retroactivamente bloquearía nóminas de
 * períodos en curso.
 */
export class AddLeaveAdvanceAuthorized1758000000002
  implements MigrationInterface
{
  name = 'AddLeaveAdvanceAuthorized1758000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ADD COLUMN IF NOT EXISTS "advance_authorized" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE "leave_requests"
         SET "advance_authorized" = true
       WHERE "type" = 'vacation'
         AND "status" = 'approved'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP COLUMN IF EXISTS "advance_authorized"
    `);
  }
}
