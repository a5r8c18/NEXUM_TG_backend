-- Agregar columna cost_center_id a movement_items
-- Para soportar asignación de costos a centros de costo en movimientos
-- Códigos que requieren centro de costo: 108/208/308 (entradas), 1105/2105/3105 (salidas)

ALTER TABLE movement_items 
ADD COLUMN IF NOT EXISTS cost_center_id UUID;

-- Agregar índice para mejor rendimiento en consultas por centro de costo
CREATE INDEX IF NOT EXISTS idx_movement_items_cost_center 
ON movement_items(cost_center_id);

-- Comentario sobre la columna
COMMENT ON COLUMN movement_items.cost_center_id IS 'Centro de costo asociado al movimiento (para códigos 108/208/308/1105/2105/3105)';
