import { MigrationInterface, QueryRunner } from "typeorm";
import * as bcrypt from "bcryptjs";
import { GLOBAL_SUBELEMENTS } from "../accounting/global-subelements.data";

/**
 * Datos iniciales mínimos para que el sistema sea operativo en cualquier
 * base de datos nueva (dev o prod):
 *
 *  - Usuario superadmin inicial (único por ahora). Email y contraseña
 *    configurables con SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *    (por defecto midas@teneduriagarcia.com / Admin1234).
 *    Cambiar la contraseña tras el primer acceso.
 *  - Subelementos globales del Nomenclador de Sub elementos de Gasto
 *    (company_id NULL), disponibles para todas las empresas.
 *
 * Idempotente: no duplica el usuario ni los subelementos si ya existen.
 */
export class SeedInitialData1791647900000 implements MigrationInterface {
    name = 'SeedInitialData1791647900000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const adminEmail = process.env.SEED_ADMIN_EMAIL || 'midas@teneduriagarcia.com';
        const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin1234';

        const existing = await queryRunner.query(
            `SELECT id FROM "users" WHERE email = $1`,
            [adminEmail],
        );
        if (existing.length === 0) {
            const hash = await bcrypt.hash(adminPassword, 10);
            await queryRunner.query(
                `INSERT INTO "users" ("id", "email", "password", "first_name", "last_name", "role", "tenant_id", "tenant_name", "tenant_type", "company_id", "is_active", "created_at", "updated_at")
                 VALUES (uuid_generate_v4(), $1, $2, 'Administrador', 'NEXUM', 'superadmin', 'tenant-owner', 'NEXUM', 'SINGLE_COMPANY', NULL, true, now(), now())`,
                [adminEmail, hash],
            );
        }

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
        const adminEmail = process.env.SEED_ADMIN_EMAIL || 'midas@teneduriagarcia.com';
        await queryRunner.query(
            `DELETE FROM "subelements" WHERE "company_id" IS NULL AND "code" = ANY($1)`,
            [GLOBAL_SUBELEMENTS.map((s) => s.code)],
        );
        await queryRunner.query(
            `DELETE FROM "users" WHERE email = $1`,
            [adminEmail],
        );
    }
}
