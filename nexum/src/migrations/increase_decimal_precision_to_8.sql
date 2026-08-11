-- Aumenta la precisión de precios unitarios e importes a 8 decimales.
--
-- Motivo: el Costo Promedio Ponderado se redondeaba a 2 decimales, lo que
-- provocaba descuadres de céntimos al liquidar cuentas por pagar/cobrar
-- durante las devoluciones (la cuenta quedaba en 'partial' en vez de 'cancelled').
--
-- Ampliar la escala de una columna numeric en PostgreSQL no pierde datos.

BEGIN;

-- ── Inventario ──
ALTER TABLE inventory_warehouse
  ALTER COLUMN unit_price TYPE numeric(18, 8);

ALTER TABLE inventory
  ALTER COLUMN unit_price TYPE numeric(18, 8);

-- ── Movimientos ──
ALTER TABLE movements
  ALTER COLUMN unit_price TYPE numeric(18, 8),
  ALTER COLUMN total_amount TYPE numeric(20, 8);

ALTER TABLE movement_items
  ALTER COLUMN unit_price TYPE numeric(18, 8),
  ALTER COLUMN total_amount TYPE numeric(20, 8);

-- ── Cuentas por pagar ──
ALTER TABLE account_payables
  ALTER COLUMN original_amount TYPE numeric(20, 8),
  ALTER COLUMN balance_amount TYPE numeric(20, 8),
  ALTER COLUMN paid_amount TYPE numeric(20, 8),
  ALTER COLUMN last_payment_amount TYPE numeric(20, 8);

-- ── Cuentas por cobrar ──
ALTER TABLE account_receivables
  ALTER COLUMN original_amount TYPE numeric(20, 8),
  ALTER COLUMN balance_amount TYPE numeric(20, 8),
  ALTER COLUMN paid_amount TYPE numeric(20, 8),
  ALTER COLUMN last_payment_amount TYPE numeric(20, 8);

-- Cierra las cuentas que quedaron en 'partial' por residuos de redondeo
-- (saldo inferior a medio centavo) originados por devoluciones previas.
UPDATE account_payables
   SET balance_amount = 0,
       status = 'cancelled'
 WHERE status = 'partial'
   AND balance_amount > 0
   AND balance_amount < 0.005;

UPDATE account_receivables
   SET balance_amount = 0,
       status = 'written_off'
 WHERE status = 'partial'
   AND balance_amount > 0
   AND balance_amount < 0.005;

COMMIT;
