-- Baseline: marca como aplicadas las migraciones cuyo DDL ya existe en la base
-- (el esquema se creó históricamente con synchronize=true).
-- Ejecutar UNA sola vez antes de `pnpm migration:run`.

CREATE TABLE IF NOT EXISTS "migrations" (
  "id" SERIAL NOT NULL,
  "timestamp" bigint NOT NULL,
  "name" character varying NOT NULL,
  CONSTRAINT "PK_migrations" PRIMARY KEY ("id")
);

INSERT INTO "migrations" ("timestamp", "name")
SELECT v.ts, v.name
FROM (VALUES
  (1700000000000::bigint, 'AddSubelementToMovementItems1700000000000'),
  (1700000000001::bigint, 'IncreaseDecimalPrecisionTo81700000000001'),
  (1700000000001::bigint, 'UpdateDeliveryReportSC2081700000000001'),
  (1700000000002::bigint, 'UpdatePhysicalCountSC2221700000000002'),
  (1700000000003::bigint, 'CreateDeliveryInformSC2181700000000003'),
  (1700000000004::bigint, 'AddInvoiceFieldsToPurchase1700000000004'),
  (1700000000005::bigint, 'AddInventoryTransitAccount1700000000005'),
  (1730000000000::bigint, 'AddCostCenterToMovementItems1730000000000'),
  (1755500000000::bigint, 'AddRevaluationSurplusToFixedAssets1755500000000')
) AS v(ts, name)
WHERE NOT EXISTS (
  SELECT 1 FROM "migrations" m WHERE m."name" = v.name
);
