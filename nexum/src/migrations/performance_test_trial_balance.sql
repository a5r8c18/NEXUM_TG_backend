-- Performance Test Script for Optimized Trial Balance
-- Purpose: Test query performance with 500+ accounts
-- Expected: <500ms response time
-- Date: 2026-04-24

-- Create test data for performance testing
-- This script generates realistic test data to measure performance

-- Step 1: Create test accounts (500+ accounts)
INSERT INTO accounts (id, company_id, code, name, type, nature, level, balance, is_active, allows_movements, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,
    1 as company_id,
    CASE 
        WHEN i < 10 THEN '1' || LPAD(i::text, 2, '0')
        WHEN i < 100 THEN '10' || LPAD(i::text, 2, '0')
        WHEN i < 200 THEN '20' || LPAD((i-99)::text, 2, '0')
        WHEN i < 300 THEN '30' || LPAD((i-199)::text, 2, '0')
        WHEN i < 400 THEN '40' || LPAD((i-299)::text, 2, '0')
        ELSE '50' || LPAD((i-399)::text, 2, '0')
    END as code,
    'Cuenta Test ' || i as name,
    CASE 
        WHEN i < 100 THEN 'asset'
        WHEN i < 200 THEN 'liability'
        WHEN i < 300 THEN 'equity'
        WHEN i < 400 THEN 'income'
        ELSE 'expense'
    END as type,
    CASE 
        WHEN i < 250 THEN 'deudora'
        ELSE 'acreedora'
    END as nature,
    CASE 
        WHEN i < 10 THEN 1
        WHEN i < 100 THEN 2
        WHEN i < 300 THEN 3
        ELSE 4
    END as level,
    RANDOM() * 10000 as balance,
    true as is_active,
    true as allows_movements,
    NOW() as created_at,
    NOW() as updated_at
FROM generate_series(1, 600) as i
ON CONFLICT (company_id, code) DO NOTHING;

-- Step 2: Create test vouchers with multiple lines
-- Each voucher will have 2-4 lines to simulate realistic data
INSERT INTO vouchers (id, company_id, voucher_number, date, description, type, status, total_amount, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,
    1 as company_id,
    'TEST-' || LPAD(i::text, 5, '0') as voucher_number,
    '2026-01-01'::date + (i % 365) * INTERVAL '1 day' as date,
    'Test Voucher ' || i as description,
    'otro' as type,
    'posted' as status,
    (RANDOM() * 1000 + 100)::numeric(10,2) as total_amount,
    NOW() as created_at,
    NOW() as updated_at
FROM generate_series(1, 2000) as i
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create voucher lines (2-4 lines per voucher)
INSERT INTO voucher_lines (id, voucher_id, account_id, account_code, account_name, debit, credit, line_order, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,
    v.id as voucher_id,
    a.id as account_id,
    a.code as account_code,
    a.name as account_name,
    CASE WHEN line_num % 2 = 0 THEN RANDOM() * 500 + 50 ELSE 0 END as debit,
    CASE WHEN line_num % 2 = 1 THEN RANDOM() * 500 + 50 ELSE 0 END as credit,
    line_num as line_order,
    NOW() as created_at,
    NOW() as updated_at
FROM vouchers v
CROSS JOIN generate_series(1, (RANDOM() * 2 + 2)::int) as line_num
INNER JOIN accounts a ON a.company_id = v.company_id 
    AND a.code = (
        CASE 
            WHEN line_num = 1 THEN '1' || LPAD(((v.id::text)::int % 99 + 1)::text, 2, '0')
            WHEN line_num = 2 THEN '10' || LPAD(((v.id::text)::int % 99 + 1)::text, 2, '0')
            WHEN line_num = 3 THEN '20' || LPAD(((v.id::text)::int % 99 + 1)::text, 2, '0')
            ELSE '30' || LPAD(((v.id::text)::int % 99 + 1)::text, 2, '0')
        END
    )
WHERE v.company_id = 1
ON CONFLICT (id) DO NOTHING;

-- Step 4: Performance Test Queries
-- Test 1: Full year trial balance (most complex case)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
SELECT 
  vl.account_code,
  vl.account_name,
  a.nature,
  a.type as account_type,
  CASE 
    WHEN a.nature = 'deudora'
    THEN COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.debit ELSE 0 END), 0) - 
         COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.credit ELSE 0 END), 0)
    ELSE COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.credit ELSE 0 END), 0) - 
         COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.debit ELSE 0 END), 0)
  END as opening_balance,
  COALESCE(SUM(vl.debit), 0) as period_debit,
  COALESCE(SUM(vl.credit), 0) as period_credit,
  CASE 
    WHEN a.nature = 'deudora'
    THEN (COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.debit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.credit ELSE 0 END), 0)) +
         (COALESCE(SUM(vl.debit), 0) - COALESCE(SUM(vl.credit), 0))
    ELSE (COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.credit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.debit ELSE 0 END), 0)) +
         (COALESCE(SUM(vl.credit), 0) - COALESCE(SUM(vl.debit), 0))
  END as closing_balance
FROM voucher_lines vl
INNER JOIN vouchers v ON vl.voucher_id = v.id  
INNER JOIN accounts a ON vl.account_id = a.id
WHERE v.company_id = 1
  AND v.status = 'posted'
  AND v.date >= '2026-01-01' AND v.date <= '2026-12-31'
GROUP BY vl.account_code, vl.account_name, a.nature, a.type
HAVING COALESCE(SUM(vl.debit), 0) > 0 OR COALESCE(SUM(vl.credit), 0) > 0
ORDER BY vl.account_code;

-- Test 2: Period-specific trial balance (Q1)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT 
  vl.account_code,
  vl.account_name,
  a.nature,
  a.type as account_type,
  CASE 
    WHEN a.nature = 'deudora'
    THEN COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.debit ELSE 0 END), 0) - 
         COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.credit ELSE 0 END), 0)
    ELSE COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.credit ELSE 0 END), 0) - 
         COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.debit ELSE 0 END), 0)
  END as opening_balance,
  COALESCE(SUM(CASE 
    WHEN v.date >= '2026-01-01' AND v.date <= '2026-03-31'
    THEN vl.debit ELSE 0 END), 0) as period_debit,
  COALESCE(SUM(CASE 
    WHEN v.date >= '2026-01-01' AND v.date <= '2026-03-31'
    THEN vl.credit ELSE 0 END), 0) as period_credit,
  CASE 
    WHEN a.nature = 'deudora'
    THEN (COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.debit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.credit ELSE 0 END), 0)) +
         (COALESCE(SUM(CASE 
           WHEN v.date >= '2026-01-01' AND v.date <= '2026-03-31'
           THEN vl.debit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE 
           WHEN v.date >= '2026-01-01' AND v.date <= '2026-03-31'
           THEN vl.credit ELSE 0 END), 0))
    ELSE (COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.credit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN v.date < '2026-01-01' THEN vl.debit ELSE 0 END), 0)) +
         (COALESCE(SUM(CASE 
           WHEN v.date >= '2026-01-01' AND v.date <= '2026-03-31'
           THEN vl.credit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE 
           WHEN v.date >= '2026-01-01' AND v.date <= '2026-03-31'
           THEN vl.debit ELSE 0 END), 0))
  END as closing_balance
FROM voucher_lines vl
INNER JOIN vouchers v ON vl.voucher_id = v.id  
INNER JOIN accounts a ON vl.account_id = a.id
WHERE v.company_id = 1
  AND v.status = 'posted'
  AND v.date >= '2026-01-01' AND v.date <= '2026-03-31'
GROUP BY vl.account_code, vl.account_name, a.nature, a.type
HAVING COALESCE(SUM(vl.debit), 0) > 0 OR COALESCE(SUM(vl.credit), 0) > 0
ORDER BY vl.account_code;

-- Test 3: No date range (all time)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT 
  vl.account_code,
  vl.account_name,
  a.nature,
  a.type as account_type,
  0 as opening_balance,
  COALESCE(SUM(vl.debit), 0) as period_debit,
  COALESCE(SUM(vl.credit), 0) as period_credit,
  CASE 
    WHEN a.nature = 'deudora'
    THEN COALESCE(SUM(vl.debit), 0) - COALESCE(SUM(vl.credit), 0)
    ELSE COALESCE(SUM(vl.credit), 0) - COALESCE(SUM(vl.debit), 0)
  END as closing_balance
FROM voucher_lines vl
INNER JOIN vouchers v ON vl.voucher_id = v.id  
INNER JOIN accounts a ON vl.account_id = a.id
WHERE v.company_id = 1
  AND v.status = 'posted'
GROUP BY vl.account_code, vl.account_name, a.nature, a.type
HAVING COALESCE(SUM(vl.debit), 0) > 0 OR COALESCE(SUM(vl.credit), 0) > 0
ORDER BY vl.account_code;

-- Performance Metrics Collection
SELECT '=== PERFORMANCE METRICS ===' as info;

-- Count test data
SELECT 'Test Data Summary' as info, 
       (SELECT COUNT(*) FROM accounts WHERE company_id = 1 AND code LIKE '1%' OR code LIKE '10%' OR code LIKE '20%' OR code LIKE '30%' OR code LIKE '40%' OR code LIKE '50%') as total_accounts,
       (SELECT COUNT(*) FROM vouchers WHERE company_id = 1 AND voucher_number LIKE 'TEST-%') as total_vouchers,
       (SELECT COUNT(*) FROM voucher_lines WHERE voucher_id IN (SELECT id FROM vouchers WHERE company_id = 1 AND voucher_number LIKE 'TEST-%')) as total_lines;

-- Index usage analysis
SELECT 'Index Usage Analysis' as info;
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename IN ('accounts', 'vouchers', 'voucher_lines')
  AND schemaname = 'public'
ORDER BY tablename, idx_scan DESC;

-- Expected Performance Results:
-- Test 1 (Full Year): <500ms for 500+ accounts
-- Test 2 (Q1): <300ms for filtered range
-- Test 3 (All Time): <200ms for simple aggregation

-- Cleanup test data
-- DELETE FROM voucher_lines WHERE voucher_id IN (SELECT id FROM vouchers WHERE voucher_number LIKE 'TEST-%');
-- DELETE FROM vouchers WHERE voucher_number LIKE 'TEST-%';
-- DELETE FROM accounts WHERE code LIKE '1%' OR code LIKE '10%' OR code LIKE '20%' OR code LIKE '30%' OR code LIKE '40%' OR code LIKE '50%';
