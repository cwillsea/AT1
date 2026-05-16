-- CreateTable
CREATE TABLE "Purpose" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "incomeAccount" INTEGER,
    "fundId" INTEGER,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CategorizationRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "pattern" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "accountNumber" INTEGER,
    "fundId" INTEGER,
    "tagId" INTEGER,
    "purposeId" INTEGER,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CategorizationRule" ("accountNumber", "createdAt", "fundId", "id", "label", "matchType", "pattern", "priority", "source", "tagId", "updatedAt") SELECT "accountNumber", "createdAt", "fundId", "id", "label", "matchType", "pattern", "priority", "source", "tagId", "updatedAt" FROM "CategorizationRule";
DROP TABLE "CategorizationRule";
ALTER TABLE "new_CategorizationRule" RENAME TO "CategorizationRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
