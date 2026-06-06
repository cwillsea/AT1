-- CreateTable
CREATE TABLE "BankStatement" (
    "statementMonth" TEXT NOT NULL PRIMARY KEY,
    "statementFile" TEXT NOT NULL,
    "beginningBalance" REAL NOT NULL,
    "totalAdditions" REAL NOT NULL,
    "totalSubtractions" REAL NOT NULL,
    "endingBalance" REAL NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
