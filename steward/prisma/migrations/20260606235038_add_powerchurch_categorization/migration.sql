-- CreateTable
CREATE TABLE "PowerChurchCategorization" (
    "externalKey" TEXT NOT NULL PRIMARY KEY,
    "accountNumber" INTEGER,
    "fundId" INTEGER,
    "tagId" INTEGER,
    "updatedAt" DATETIME NOT NULL
);
