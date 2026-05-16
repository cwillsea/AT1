-- CreateTable
CREATE TABLE "SyncState" (
    "source" TEXT NOT NULL PRIMARY KEY,
    "lastFetchedThrough" TEXT,
    "lastSyncAt" DATETIME,
    "lastError" TEXT
);

-- CreateTable
CREATE TABLE "ManualMark" (
    "externalKey" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "marked" BOOLEAN NOT NULL DEFAULT true,
    "markedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT
);
