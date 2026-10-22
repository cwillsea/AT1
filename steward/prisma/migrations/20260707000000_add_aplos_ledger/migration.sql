-- CreateTable
CREATE TABLE "AplosTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "note" TEXT,
    "memo" TEXT,
    "contactName" TEXT,
    "contactId" INTEGER,
    "amount" REAL NOT NULL,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "inClosedPeriod" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TEXT,
    "modifiedAt" TEXT,
    "raw" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AplosTransactionLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transactionId" INTEGER NOT NULL,
    "lineIndex" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "accountNumber" INTEGER,
    "fundId" INTEGER,
    CONSTRAINT "AplosTransactionLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AplosTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AplosLineTag" (
    "lineId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    PRIMARY KEY ("lineId", "tagId"),
    CONSTRAINT "AplosLineTag_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "AplosTransactionLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AplosTransaction_date_idx" ON "AplosTransaction"("date");

-- CreateIndex
CREATE INDEX "AplosTransaction_modifiedAt_idx" ON "AplosTransaction"("modifiedAt");

-- CreateIndex
CREATE INDEX "AplosTransactionLine_accountNumber_idx" ON "AplosTransactionLine"("accountNumber");

-- CreateIndex
CREATE INDEX "AplosTransactionLine_fundId_idx" ON "AplosTransactionLine"("fundId");

-- CreateIndex
CREATE INDEX "AplosTransactionLine_transactionId_idx" ON "AplosTransactionLine"("transactionId");

-- CreateIndex
CREATE INDEX "AplosLineTag_tagId_idx" ON "AplosLineTag"("tagId");
