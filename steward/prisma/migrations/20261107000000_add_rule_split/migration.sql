-- Payroll rules can split one recipient's payment across several lines
-- (e.g. Housing Allowance fixed $ + Salary for the rest). One CategorizationRule
-- row per line; NULL splitKind means "remainder" so existing rules are unchanged.
ALTER TABLE "CategorizationRule" ADD COLUMN "splitKind" TEXT;
ALTER TABLE "CategorizationRule" ADD COLUMN "splitValue" REAL;
