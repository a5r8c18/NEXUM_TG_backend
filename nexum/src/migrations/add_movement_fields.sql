-- Migration: Add related_movement_id and expense_element columns to movements table
-- Date: 2026-05-17
-- Purpose: 
--   1. related_movement_id: FK to link paired transfer movements (exit ↔ entry)
--   2. expense_element: Optional expense element for cost center movements (108/208/308/1105/2105/3105)

-- Add related_movement_id column (nullable UUID referencing self)
ALTER TABLE movements
ADD COLUMN IF NOT EXISTS related_movement_id UUID NULL;

-- Add expense_element column (nullable varchar for expense element description)
ALTER TABLE movements
ADD COLUMN IF NOT EXISTS expense_element VARCHAR(100) NULL;

-- Create index for faster lookups of related movements
CREATE INDEX IF NOT EXISTS idx_movements_related_movement_id
ON movements (related_movement_id)
WHERE related_movement_id IS NOT NULL;

-- Create index for expense element filtering
CREATE INDEX IF NOT EXISTS idx_movements_expense_element
ON movements (expense_element)
WHERE expense_element IS NOT NULL;

-- ── Warehouse custodian fields (Res. 11-2007 MAC) ──
ALTER TABLE warehouses
ADD COLUMN IF NOT EXISTS custodian_id UUID NULL;

ALTER TABLE warehouses
ADD COLUMN IF NOT EXISTS custodian_name VARCHAR(255) NULL;
