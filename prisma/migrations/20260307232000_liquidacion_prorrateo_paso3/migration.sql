CREATE TABLE "LiquidacionProrrateoUnidad" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "liquidacionId" INTEGER NOT NULL,
    "unidadId" INTEGER NOT NULL,
    "coeficiente" REAL NOT NULL,
    "saldoAnterior" REAL NOT NULL,
    "pagosPeriodo" REAL NOT NULL,
    "saldoDeudor" REAL NOT NULL,
    "saldoAFavor" REAL NOT NULL,
    "intereses" REAL NOT NULL,
    "gastoOrdinario" REAL NOT NULL,
    "redondeo" REAL NOT NULL,
    "total" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiquidacionProrrateoUnidad_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiquidacionProrrateoUnidad_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LiquidacionProrrateoUnidad_liquidacionId_unidadId_key" ON "LiquidacionProrrateoUnidad"("liquidacionId", "unidadId");
CREATE INDEX "LiquidacionProrrateoUnidad_liquidacionId_idx" ON "LiquidacionProrrateoUnidad"("liquidacionId");
CREATE INDEX "LiquidacionProrrateoUnidad_unidadId_idx" ON "LiquidacionProrrateoUnidad"("unidadId");
