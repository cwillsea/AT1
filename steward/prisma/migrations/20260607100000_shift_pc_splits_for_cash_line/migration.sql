-- Reserve index 0 for the new top "Aplos cash / checking" line by shifting
-- every existing PowerChurchSplit row's index up by 1. Use temporary negative
-- indexes during the shift so SQLite's PK (externalKey, index) doesn't blow up
-- when multiple rows for the same key would collide mid-update.

UPDATE "PowerChurchSplit"
SET "index" = -("index" + 1);

UPDATE "PowerChurchSplit"
SET "index" = -"index";

-- Insert a fresh empty cash line at index 0 for every externalKey.
INSERT INTO "PowerChurchSplit" ("externalKey", "index", "amount", "accountNumber", "fundId", "tagId", "updatedAt")
SELECT DISTINCT "externalKey", 0, 0, NULL, NULL, NULL, CURRENT_TIMESTAMP
FROM "PowerChurchSplit";
