-- CreateTable
CREATE TABLE "PowerChurchSplit" (
    "externalKey" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "accountNumber" INTEGER,
    "fundId" INTEGER,
    "tagId" INTEGER,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("externalKey", "index")
);

-- Migrate existing single-row categorizations into PowerChurchSplit at index 0.
-- amount is set to 0 here; the UI will hydrate from the entry total when the
-- user opens the card and reflect the existing account/fund/tag picks.
INSERT INTO "PowerChurchSplit" ("externalKey", "index", "amount", "accountNumber", "fundId", "tagId", "updatedAt")
SELECT "externalKey", 0, 0, "accountNumber", "fundId", "tagId", "updatedAt"
FROM "PowerChurchCategorization";

-- DropTable
DROP TABLE "PowerChurchCategorization";
