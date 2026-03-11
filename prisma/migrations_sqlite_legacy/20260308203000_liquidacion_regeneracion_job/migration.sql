CREATE TABLE "LiquidacionRegeneracionJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "liquidacionId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "expectedFiles" INTEGER NOT NULL DEFAULT 0,
    "generatedFiles" INTEGER NOT NULL DEFAULT 0,
    "validatedFiles" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorDetail" TEXT,
    "requestedByUserId" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiquidacionRegeneracionJob_liquidacionId_fkey"
      FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LiquidacionRegeneracionJob_liquidacionId_idx" ON "LiquidacionRegeneracionJob"("liquidacionId");
CREATE INDEX "LiquidacionRegeneracionJob_status_idx" ON "LiquidacionRegeneracionJob"("status");
CREATE INDEX "LiquidacionRegeneracionJob_liquidacionId_createdAt_idx" ON "LiquidacionRegeneracionJob"("liquidacionId", "createdAt");
