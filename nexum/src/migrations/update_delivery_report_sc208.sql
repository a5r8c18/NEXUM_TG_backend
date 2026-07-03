-- Actualizar delivery_reports para SC-2-08 (Vale de Entrega) - Campos específicos del formato oficial MINCIN
-- Nota: Esta migración asume que la tabla existe y necesita ser actualizada
-- Se recomienda hacer una migración de recreación si la estructura es muy diferente

-- Eliminar columnas obsoletas si existen
ALTER TABLE delivery_reports DROP COLUMN IF EXISTS code;
ALTER TABLE delivery_reports DROP COLUMN IF EXISTS entity;
ALTER TABLE delivery_reports DROP COLUMN IF EXISTS warehouse;
ALTER TABLE delivery_reports DROP COLUMN IF EXISTS document;
ALTER TABLE delivery_reports DROP COLUMN IF EXISTS reason;

-- Agregar nuevas columnas para SC-2-08
ALTER TABLE delivery_reports 
ADD COLUMN report_number VARCHAR(50) UNIQUE NOT NULL DEFAULT 'VE-TEMP',
ADD COLUMN report_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN entity_name VARCHAR(255) NOT NULL DEFAULT 'Entidad',
ADD COLUMN entity_nit VARCHAR(50) NULL,
ADD COLUMN warehouse_id VARCHAR(100) NOT NULL DEFAULT 'WH-001',
ADD COLUMN warehouse_name VARCHAR(255) NOT NULL DEFAULT 'Almacén Principal',
ADD COLUMN authorization_document VARCHAR(100) NULL,
ADD COLUMN delivered_by VARCHAR(255) NULL,
ADD COLUMN received_by VARCHAR(255) NULL,
ADD COLUMN received_at TIMESTAMP NULL,
ADD COLUMN total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN report_type VARCHAR(50) NOT NULL DEFAULT 'SC-2-08',
ADD COLUMN observations TEXT NULL,
ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'draft';

-- Crear índices
CREATE INDEX idx_delivery_reports_report_number ON delivery_reports(report_number);
CREATE INDEX idx_delivery_reports_status ON delivery_reports(status);
CREATE INDEX idx_delivery_reports_warehouse_id ON delivery_reports(warehouse_id);
