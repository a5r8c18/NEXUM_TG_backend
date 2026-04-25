-- Migration: Unify Account and Subaccount tables
-- Purpose: Move all subaccount records to account table with level=4 and parentCode
-- Environment: PostgreSQL
-- Date: 2026-04-24

-- Step 1: Add temporary columns to accounts table if they don't exist
DO $$
BEGIN
    -- Check if parentCode column exists, if not add it (should already exist)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='accounts' AND column_name='parentCode'
    ) THEN
        ALTER TABLE accounts ADD COLUMN parentCode VARCHAR(50) NULL;
    END IF;
    
    -- Check if parentAccountId column exists, if not add it (should already exist)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='accounts' AND column_name='parentAccountId'
    ) THEN
        ALTER TABLE accounts ADD COLUMN parentAccountId UUID NULL;
    END IF;
END $$;

-- Step 2: Backup existing data (optional but recommended)
CREATE TABLE IF NOT EXISTS accounts_backup AS 
SELECT * FROM accounts;

CREATE TABLE IF NOT EXISTS subaccounts_backup AS 
SELECT * FROM subaccounts;

-- Step 3: Migrate subaccounts to accounts table
INSERT INTO accounts (
    id,
    company_id,
    code,
    name,
    description,
    type,
    nature,
    level,
    group_number,
    parent_code,
    parent_account_id,
    balance,
    is_active,
    allows_movements,
    created_at,
    updated_at
)
SELECT 
    s.id,
    s.company_id,
    s.subaccount_code as code,
    s.subaccount_name as name,
    s.description,
    COALESCE(a.type, 'expense') as type, -- Default to expense if parent account type not found
    COALESCE(a.nature, 'deudora') as nature, -- Default to deudora if parent account nature not found
    4 as level, -- All subaccounts become level 4
    a.group_number, -- Inherit from parent account
    a.code as parent_code, -- Parent account code
    s.account_id as parent_account_id, -- Reference to parent account
    0 as balance, -- Start with zero balance
    s.is_active as is_active,
    TRUE as allows_movements, -- Subaccounts typically allow movements
    s.created_at,
    s.updated_at
FROM subaccounts s
LEFT JOIN accounts a ON s.account_id = a.id
WHERE s.is_active = TRUE;

-- Step 4: Update any records that might have missing parent information
UPDATE accounts 
SET 
    type = COALESCE(type, 'expense'),
    nature = COALESCE(nature, 'deudora'),
    allows_movements = TRUE
WHERE level = 4 AND (type IS NULL OR nature IS NULL);

-- Step 5: Create index for better performance on parent_code
CREATE INDEX IF NOT EXISTS idx_accounts_parent_code ON accounts(parent_code) WHERE parent_code IS NOT NULL;

-- Step 6: Verify migration
SELECT 
    'Migration Summary' as info,
    COUNT(*) as total_accounts,
    COUNT(*) FILTER (WHERE level = 4) as migrated_subaccounts,
    COUNT(*) FILTER (WHERE level < 4) as original_accounts,
    COUNT(*) FILTER (WHERE parent_code IS NOT NULL) as accounts_with_parent
FROM accounts;

-- Step 7: Check for any potential conflicts (duplicate codes)
SELECT 
    'Potential Conflicts' as info,
    code,
    COUNT(*) as count
FROM accounts 
GROUP BY code 
HAVING COUNT(*) > 1;

-- Step 8: Optional - Drop subaccounts table after verification
-- Uncomment the following lines ONLY after verifying the migration was successful
-- DROP TABLE IF EXISTS subaccounts CASCADE;

-- Step 9: Optional - Clean up backup tables after successful verification
-- Uncomment the following lines ONLY after everything is working correctly
-- DROP TABLE IF EXISTS accounts_backup;
-- DROP TABLE IF EXISTS subaccounts_backup;

COMMIT;

-- Notes for verification:
-- 1. Check that all subaccounts were migrated: SELECT COUNT(*) FROM accounts WHERE level = 4;
-- 2. Verify parent relationships: SELECT a.code, a.parent_code, a.level FROM accounts a WHERE a.parent_code IS NOT NULL LIMIT 10;
-- 3. Check for duplicate codes: SELECT code, COUNT(*) FROM accounts GROUP BY code HAVING COUNT(*) > 1;
-- 4. Test application functionality before dropping original tables
