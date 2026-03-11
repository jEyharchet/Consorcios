CREATE TABLE "LiquidacionDeuda" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "liquidacionId" INTEGER NOT NULL,
    "expensaId" INTEGER NOT NULL,
    "capitalOriginal" REAL NOT NULL,
    "interesCalculado" REAL NOT NULL,
    "criterio" TEXT NOT NULL,
    "importeLiquidado" REAL NOT NULL,
    "fechaCalculoInteres" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiquidacionDeuda_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiquidacionDeuda_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "Expensa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LiquidacionDeuda_liquidacionId_idx" ON "LiquidacionDeuda"("liquidacionId");
CREATE INDEX "LiquidacionDeuda_expensaId_idx" ON "LiquidacionDeuda"("expensaId");
CREATE INDEX "LiquidacionDeuda_liquidacionId_expensaId_idx" ON "LiquidacionDeuda"("liquidacionId", "expensaId");
