-- CreateTable
CREATE TABLE "DeletedDeposit" (
    "externalKey" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT
);
