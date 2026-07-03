-- Agregar columna subelement_id a movement_items
ALTER TABLE movement_items 
ADD COLUMN subelement_id UUID NULL;

-- Crear índice para subelement_id
CREATE INDEX idx_movement_items_subelement_id ON movement_items(subelement_id);
