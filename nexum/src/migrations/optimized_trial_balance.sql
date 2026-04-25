-- Optimized Trial Balance Query
-- Purpose: Replace N+1 queries with single aggregated query
-- Performance: <500ms for 500+ accounts
-- Date: 2026-04-24

-- Single Query Approach with Window Functions
WITH account_movements AS (
  -- Get all voucher lines with account info and date categorization
  SELECT 
    vl.account_code,
    vl.account_name,
    a.nature,
    a.type as account_type,
    vl.debit,
    vl.credit,
    v.date,
    v.company_id,
    CASE 
      WHEN :fromDate IS NOT NULL AND v.date < :fromDate THEN 'opening'
      WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) THEN 'period'
      ELSE 'outside'
    END as movement_type
  FROM voucher_lines vl
  INNER JOIN vouchers v ON vl.voucher_id = v.id
  INNER JOIN accounts a ON vl.account_id = a.id
  WHERE v.company_id = :companyId
    AND v.status = 'posted'
    AND (:fromDate IS NULL OR v.date <= :toDate)
    AND (:toDate IS NULL OR v.date >= :fromDate)
),
aggregated_movements AS (
  -- Aggregate movements by account and type
  SELECT 
    account_code,
    account_name,
    nature,
    account_type,
    movement_type,
    COALESCE(SUM(debit), 0) as total_debit,
    COALESCE(SUM(credit), 0) as total_credit
  FROM account_movements
  GROUP BY account_code, account_name, nature, account_type, movement_type
),
pivot_movements AS (
  -- Pivot opening and period movements into columns
  SELECT 
    account_code,
    account_name,
    nature,
    account_type,
    COALESCE(MAX(CASE WHEN movement_type = 'opening' THEN total_debit END), 0) as opening_debit,
    COALESCE(MAX(CASE WHEN movement_type = 'opening' THEN total_credit END), 0) as opening_credit,
    COALESCE(MAX(CASE WHEN movement_type = 'period' THEN total_debit END), 0) as period_debit,
    COALESCE(MAX(CASE WHEN movement_type = 'period' THEN total_credit END), 0) as period_credit
  FROM aggregated_movements
  GROUP BY account_code, account_name, nature, account_type
)
-- Final calculation with opening balance, period movements, and closing balance
SELECT 
  account_code,
  account_name,
  nature,
  account_type,
  -- Calculate opening balance based on account nature
  CASE 
    WHEN nature = 'deudora' 
    THEN opening_debit - opening_credit
    ELSE opening_credit - opening_debit
  END as opening_balance,
  period_debit,
  period_credit,
  -- Calculate closing balance: opening + period movement
  CASE 
    WHEN nature = 'deudora' 
    THEN (opening_debit - opening_credit) + (period_debit - period_credit)
    ELSE (opening_credit - opening_debit) + (period_credit - period_debit)
  END as closing_balance
FROM pivot_movements
-- Only include accounts with actual movements
WHERE (opening_debit > 0 OR opening_credit > 0 OR period_debit > 0 OR period_credit > 0)
ORDER BY account_code;

-- Alternative Approach using Conditional Aggregation (simpler but potentially less performant)
SELECT 
  vl.account_code,
  vl.account_name,
  a.nature,
  a.type as account_type,
  -- Opening balance (movements before fromDate)
  CASE 
    WHEN a.nature = 'deudora'
    THEN COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0) - 
         COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0)
    ELSE COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0) - 
         COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0)
  END as opening_balance,
  -- Period debit
  COALESCE(SUM(CASE 
    WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
    THEN vl.debit ELSE 0 END), 0) as period_debit,
  -- Period credit  
  COALESCE(SUM(CASE 
    WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
    THEN vl.credit ELSE 0 END), 0) as period_credit,
  -- Closing balance (opening + period movement)
  CASE 
    WHEN a.nature = 'deudora'
    THEN (COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0)) +
         (COALESCE(SUM(CASE 
           WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
           THEN vl.debit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE 
           WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
           THEN vl.credit ELSE 0 END), 0))
    ELSE (COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0)) +
         (COALESCE(SUM(CASE 
           WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
           THEN vl.credit ELSE 0 END), 0) - 
          COALESCE(SUM(CASE 
           WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
           THEN vl.debit ELSE 0 END), 0))
  END as closing_balance
FROM voucher_lines vl
INNER JOIN vouchers v ON vl.voucher_id = v.id  
INNER JOIN accounts a ON vl.account_id = a.id
WHERE v.company_id = :companyId
  AND v.status = 'posted'
  AND (:fromDate IS NULL OR v.date <= :toDate)
  AND (:toDate IS NULL OR v.date >= :fromDate)
GROUP BY vl.account_code, vl.account_name, a.nature, a.type
HAVING (
  -- Only include accounts with movements
  COALESCE(SUM(vl.debit), 0) > 0 OR 
  COALESCE(SUM(vl.credit), 0) > 0
)
ORDER BY vl.account_code;

-- Performance Indexes (if not already exists)
CREATE INDEX IF NOT EXISTS idx_voucher_lines_account_company ON voucher_lines(account_id, voucher_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_company_status_date ON vouchers(company_id, status, date);
CREATE INDEX IF NOT EXISTS idx_accounts_company_nature ON accounts(company_id, nature);

-- Query Execution Plan Analysis
EXPLAIN (ANALYZE, BUFFERS) 
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
ORDER BY vl.account_code;
