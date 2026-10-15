import { MigrationInterface, QueryRunner } from "typeorm";
import { GLOBAL_SUBELEMENTS } from "../accounting/global-subelements.data";

/**
 * Resiembra los subelementos globales del Nomenclador que pudieron perderse
 * durante la limpieza de datos transaccionales. Idempotente: solo inserta los
 * códigos que no existan ya.
 */
export class ReseedGlobalSubelements1792020000000 implements MigrationInterface {
    name = 'ReseedGlobalSubelements1792020000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const s of GLOBAL_SUBELEMENTS) {
            await queryRunner.query(
                `INSERT INTO "subelements" ("id", "code", "name", "category", "company_id", "is_active", "created_at", "updated_at")
                 SELECT uuid_generate_v4(), $1::varchar, $2::varchar, $3::varchar, NULL, true, now(), now()
                 WHERE NOT EXISTS (SELECT 1 FROM "subelements" WHERE "code" = $1::varchar)`,
                [s.code, s.name, s.category],
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM "subelements" WHERE "company_id" IS NULL AND "code" = ANY($1)`,
            [GLOBAL_SUBELEMENTS.map((s) => s.code)],
        );
    }
}
