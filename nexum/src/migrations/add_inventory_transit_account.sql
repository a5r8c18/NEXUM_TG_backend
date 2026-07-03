-- Agregar cuenta puente 189-01 (Mercancías en Tránsito / Recepción no Facturada)
INSERT INTO accounts (code, name, description, type, nature, level, group_number, parent_code, allows_movements, created_at, updated_at)
VALUES ('189-01', 'Mercancías en Tránsito / Recepción no Facturada', 'Cuenta puente para mercancías recibidas pero no facturadas', 'asset', 'deudora', 4, '10', '189', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO NOTHING;
