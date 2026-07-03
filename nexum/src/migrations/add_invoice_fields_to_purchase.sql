-- Agregar campos a purchases para distinguir recepción de factura
ALTER TABLE purchases 
ADD COLUMN invoice_number VARCHAR(100) NULL,
ADD COLUMN invoice_date DATE NULL,
ADD COLUMN is_invoiced BOOLEAN NOT NULL DEFAULT FALSE;

-- Crear índices
CREATE INDEX idx_purchases_invoice_number ON purchases(invoice_number);
CREATE INDEX idx_purchases_is_invoiced ON purchases(is_invoiced);
