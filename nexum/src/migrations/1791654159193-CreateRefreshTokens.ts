import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRefreshTokens1791654159193 implements MigrationInterface {
    name = 'CreateRefreshTokens1791654159193'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP NOT NULL, "is_revoked" boolean NOT NULL DEFAULT false, "revoked_at" TIMESTAMP, "ip_address" character varying(45), "user_agent" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "companies" ALTER COLUMN "night_shift_rate_evening" SET DEFAULT '0.6'`);
        await queryRunner.query(`ALTER TABLE "companies" ALTER COLUMN "night_shift_rate_night" SET DEFAULT '1.15'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
        await queryRunner.query(`ALTER TABLE "companies" ALTER COLUMN "night_shift_rate_night" SET DEFAULT 1.15`);
        await queryRunner.query(`ALTER TABLE "companies" ALTER COLUMN "night_shift_rate_evening" SET DEFAULT 0.6`);
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_token_hash"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_expires_at"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    }

}
