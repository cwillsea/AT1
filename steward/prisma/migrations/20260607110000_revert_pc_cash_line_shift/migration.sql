-- Undo the cash-line shift: drop the empty index=0 rows that the previous
-- migration injected, then move every remaining row down by 1 so the user's
-- categorized splits are back at index 0, 1, 2 ... like before.

DELETE FROM "PowerChurchSplit"
WHERE "index" = 0
  AND "amount" = 0
  AND "accountNumber" IS NULL
  AND "fundId" IS NULL
  AND "tagId" IS NULL;

-- Shift remaining indexes down by 1. Use temporary negatives so the SQLite
-- composite PK (externalKey, index) doesn't fail mid-update.
UPDATE "PowerChurchSplit" SET "index" = -("index" - 1);
UPDATE "PowerChurchSplit" SET "index" = -"index";
