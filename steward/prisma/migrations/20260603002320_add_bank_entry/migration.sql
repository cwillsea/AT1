-- CreateTable
CREATE TABLE "BankEntry" (
    "externalKey" TEXT NOT NULL PRIMARY KEY,
    "statementFile" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "checkNumber" INTEGER,
    "accountNumber" INTEGER,
    "fundId" INTEGER,
    "tagId" INTEGER,
    "autoSkip" BOOLEAN NOT NULL DEFAULT false,
    "parsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
