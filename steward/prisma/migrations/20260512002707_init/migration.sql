-- CreateTable
CREATE TABLE "CategorizationRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "pattern" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "accountNumber" INTEGER NOT NULL,
    "fundId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PostingLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "aplosTxnId" TEXT,
    "status" TEXT NOT NULL,
    "requestBody" TEXT NOT NULL,
    "responseBody" TEXT,
    "postedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PostingLog_externalKey_key" ON "PostingLog"("externalKey");
