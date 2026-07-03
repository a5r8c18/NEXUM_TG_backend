-- Actualizar physical_counts para SC-2-22 (Conteo Físico) - Campos específicos del formato oficial MINCIN

-- Agregar nuevas columnas para SC-2-22
ALTER TABLE physical_counts 
ADD COLUMN authorization_number VARCHAR(50) NULL,
ADD COLUMN authorization_date TIMESTAMP NULL,
ADD COLUMN responsible_person VARCHAR(255) NULL,
ADD COLUMN count_team TEXT NULL,
ADD COLUMN count_method VARCHAR(100) NOT NULL DEFAULT 'complete',
ADD COLUMN count_period_start DATE NULL,
ADD COLUMN count_period_end DATE NULL;

-- Crear índices
CREATE INDEX idx_physical_counts_authorization_number ON physical_counts(authorization_number);
CREATE INDEX idx_physical_counts_count_method ON physical_counts(count_method);
