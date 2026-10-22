CREATE TABLE "AplosAccountBalance" (
    "accountNumber" INTEGER NOT NULL PRIMARY KEY,
    "balance"       REAL NOT NULL,
    "txnCount"      INTEGER NOT NULL,
    "computedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
