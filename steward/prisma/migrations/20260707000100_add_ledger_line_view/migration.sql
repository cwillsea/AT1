-- Flat, human-readable view over the normalized ledger: one row per split line,
-- joined to its transaction header and the cached Account/Fund names, with tag
-- (ministry) names aggregated. Gives a text-to-SQL agent (and manual SQL) a
-- single denormalized surface so common "sum by account/fund/ministry over a
-- date range" questions need no joins.
CREATE VIEW "LedgerLineView" AS
SELECT
  l."id"              AS "lineId",
  l."transactionId"   AS "transactionId",
  t."date"            AS "date",
  t."note"            AS "note",
  t."memo"            AS "memo",
  t."contactName"     AS "contactName",
  l."amount"          AS "amount",
  l."accountNumber"   AS "accountNumber",
  a."name"            AS "accountName",
  a."category"        AS "accountCategory",
  l."fundId"          AS "fundId",
  f."name"            AS "fundName",
  t."isReconciled"    AS "isReconciled",
  t."inClosedPeriod"  AS "inClosedPeriod",
  (
    SELECT group_concat(tg."name", ', ')
    FROM "AplosLineTag" lt
    JOIN "Tag" tg ON tg."id" = lt."tagId"
    WHERE lt."lineId" = l."id"
  )                   AS "tagNames"
FROM "AplosTransactionLine" l
JOIN "AplosTransaction" t ON t."id" = l."transactionId"
LEFT JOIN "Account" a ON a."accountNumber" = l."accountNumber"
LEFT JOIN "Fund" f ON f."id" = l."fundId";
