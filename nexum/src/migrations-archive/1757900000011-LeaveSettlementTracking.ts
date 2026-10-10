import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marcador de liquidación de licencias.
 *
 * Hasta aquí nada impedía pagar dos veces la misma licencia: la unicidad de
 * nóminas es por concepto+período y una licencia puede aparecer en períodos
 * distintos o en nóminas de rangos solapados. Las columnas acumulan lo ya
 * retribuido por líneas con "leaveRequestId" en nóminas no canceladas —a las
 * que se da backfill desde el histórico— y la generación las incrementa
 * dentro de la misma transacción que crea la nómina, bajo bloqueo de la fila
 * de la licencia. Al cancelar la nómina se restituyen.
 */
export class LeaveSettlementTracking1757900000011
  implements MigrationInterface
{
  name = 'LeaveSettlementTracking1757900000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ADD COLUMN IF NOT EXISTS "settled_units" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "settled_amount" numeric(15,2) NOT NULL DEFAULT 0
    `);

    // Backfill: lo ya pagado en nóminas no canceladas cuenta como liquidado.
    await queryRunner.query(`
      UPDATE "leave_requests" lr
         SET "settled_units" = sub.units,
             "settled_amount" = sub.amount
        FROM (
          SELECT i."leave_request_id" AS "leaveId",
                 SUM(i."paid_units") AS units,
                 SUM(i."grossSalary") AS amount
            FROM "payroll_items" i
            JOIN "payrolls" p ON p."id" = i."payrollId"
           WHERE i."leave_request_id" IS NOT NULL
             AND p."status" <> 'cancelled'
           GROUP BY i."leave_request_id"
        ) sub
       WHERE lr."id" = sub."leaveId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP COLUMN IF EXISTS "settled_amount",
        DROP COLUMN IF EXISTS "settled_units"
    `);
  }
}
