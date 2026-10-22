-- User-confirmed bank↔books links surfaced on /reconcile.
CREATE TABLE "ReconcileMatch" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "bankTxnId"  TEXT NOT NULL,
    "aplosTxnId" TEXT NOT NULL,
    "linkedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ReconcileMatch_bankTxnId_key"  ON "ReconcileMatch"("bankTxnId");
CREATE UNIQUE INDEX "ReconcileMatch_aplosTxnId_key" ON "ReconcileMatch"("aplosTxnId");
