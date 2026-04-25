-- Test Script: Transaction Rollback Scenarios
-- Purpose: Test that transactions properly rollback on errors
-- Environment: PostgreSQL
-- Date: 2026-04-24

-- Test 1: Create voucher with invalid account (should rollback)
BEGIN;

-- Insert test account
INSERT INTO accounts (id, company_id, code, name, type, nature, level, balance, is_active, allows_movements, created_at, updated_at)
VALUES ('test-account-1', 1, '101', 'Caja Test', 'asset', 'deudora', 1, 0, true, true, NOW(), NOW());

-- Try to create voucher with invalid account (should fail and rollback)
-- This should trigger an error and rollback the entire transaction
INSERT INTO vouchers (id, company_id, voucher_number, date, description, type, status, total_amount, created_at, updated_at)
VALUES ('test-voucher-1', 1, 'TEST-00001', '2026-04-24', 'Test Voucher', 'otro', 'draft', 100, NOW(), NOW());

-- This should fail because account doesn't exist
INSERT INTO voucher_lines (id, voucher_id, account_id, account_code, account_name, debit, credit, line_order, created_at, updated_at)
VALUES ('test-line-1', 'test-voucher-1', 'non-existent-account', '999', 'Invalid Account', 100, 0, 1, NOW(), NOW());

COMMIT;

-- Check if rollback worked (should be no records)
SELECT 'Test 1 Results' as info, COUNT(*) as vouchers FROM vouchers WHERE voucher_number LIKE 'TEST-%';
SELECT 'Test 1 Results' as info, COUNT(*) as accounts FROM accounts WHERE code = '101' AND name LIKE 'Test%';

-- Test 2: Test postVoucher rollback (simulate balance update failure)
BEGIN;

-- Create test voucher with valid data
INSERT INTO vouchers (id, company_id, voucher_number, date, description, type, status, total_amount, created_at, updated_at)
VALUES ('test-voucher-2', 1, 'TEST-00002', '2026-04-24', 'Test Voucher 2', 'otro', 'draft', 100, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Insert test account
INSERT INTO accounts (id, company_id, code, name, type, nature, level, balance, is_active, allows_movements, created_at, updated_at)
VALUES ('test-account-2', 1, '102', 'Banco Test', 'asset', 'deudora', 1, 1000, true, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Insert voucher line
INSERT INTO voucher_lines (id, voucher_id, account_id, account_code, account_name, debit, credit, line_order, created_at, updated_at)
VALUES ('test-line-2', 'test-voucher-2', 'test-account-2', '102', 'Banco Test', 100, 0, 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Update account balance (simulate success)
UPDATE accounts SET balance = balance + 100 WHERE id = 'test-account-2';

-- Update voucher status (simulate success)
UPDATE vouchers SET status = 'posted' WHERE id = 'test-voucher-2';

-- Now simulate an error that should cause rollback
-- This will cause a constraint violation or other error
INSERT INTO accounts (id, company_id, code, name, type, nature, level, balance, is_active, allows_movements, created_at, updated_at)
VALUES ('test-account-2', 1, '102', 'Duplicate Account', 'asset', 'deudora', 1, 0, true, true, NOW(), NOW());

COMMIT;

-- Check if rollback worked
SELECT 'Test 2 Results' as info, status FROM vouchers WHERE id = 'test-voucher-2';
SELECT 'Test 2 Results' as info, balance FROM accounts WHERE id = 'test-account-2';

-- Test 3: Test deleteVoucher with foreign key constraints
BEGIN;

-- Create test data
INSERT INTO vouchers (id, company_id, voucher_number, date, description, type, status, total_amount, created_at, updated_at)
VALUES ('test-voucher-3', 1, 'TEST-00003', '2026-04-24', 'Test Voucher 3', 'otro', 'draft', 100, NOW(), NOW());

INSERT INTO voucher_lines (id, voucher_id, account_id, account_code, account_name, debit, credit, line_order, created_at, updated_at)
VALUES ('test-line-3', 'test-voucher-3', 'test-account-2', '102', 'Banco Test', 100, 0, 1, NOW(), NOW());

-- Try to delete voucher (should work in transaction)
DELETE FROM voucher_lines WHERE voucher_id = 'test-voucher-3';
DELETE FROM vouchers WHERE id = 'test-voucher-3';

-- Simulate error after successful delete
-- This should cause rollback and restore the voucher
SELECT 1/0; -- Division by zero error

COMMIT;

-- Check if rollback worked
SELECT 'Test 3 Results' as info, COUNT(*) as vouchers FROM vouchers WHERE id = 'test-voucher-3';
SELECT 'Test 3 Results' as info, COUNT(*) as lines FROM voucher_lines WHERE voucher_id = 'test-voucher-3';

-- Cleanup test data
DELETE FROM voucher_lines WHERE voucher_id LIKE 'test-%';
DELETE FROM vouchers WHERE id LIKE 'test-%';
DELETE FROM accounts WHERE id LIKE 'test-%' OR code IN ('101', '102');

-- Test Summary Queries
SELECT '=== TRANSACTION TEST SUMMARY ===' as info;

-- Check for any remaining test data
SELECT 'Remaining Test Vouchers' as info, COUNT(*) as count FROM vouchers WHERE voucher_number LIKE 'TEST-%';
SELECT 'Remaining Test Accounts' as info, COUNT(*) as count FROM accounts WHERE code IN ('101', '102') AND name LIKE '%Test%';
SELECT 'Remaining Test Lines' as info, COUNT(*) as count FROM voucher_lines WHERE voucher_id LIKE 'test-%';

-- Test database constraints
SELECT 'Database Constraints Check' as info;
SELECT COUNT(*) as total_vouchers FROM vouchers;
SELECT COUNT(*) as total_lines FROM voucher_lines;
SELECT COUNT(*) as total_accounts FROM accounts;

-- Expected Results:
-- Test 1: Should rollback completely (0 records)
-- Test 2: Should rollback balance and status changes
-- Test 3: Should rollback delete operations
-- All tests should leave database in consistent state
