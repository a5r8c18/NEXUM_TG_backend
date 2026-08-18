-- Superávit de revalorización acumulado por activo fijo.
-- Cuenta 613 "Revalorización de Activos Fijos Tangibles" (Nomenclador 2016).
-- Un déficit posterior sólo puede debitarse contra 613 hasta agotar este saldo;
-- el exceso se reconoce en la cuenta 845 "Gastos por Pérdidas".

ALTER TABLE fixed_assets
ADD COLUMN IF NOT EXISTS revaluation_surplus NUMERIC(12,2) NOT NULL DEFAULT 0;
