CREATE TABLE "LiquidacionGastoHistorico" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "liquidacionId" INTEGER NOT NULL,
    "gastoOrigenId" INTEGER,
    "fecha" DATETIME NOT NULL,
    "periodo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoExpensa" TEXT NOT NULL,
    "rubroExpensa" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "proveedorNombre" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiquidacionGastoHistorico_liquidacionId_fkey"
      FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LiquidacionGastoHistorico_liquidacionId_idx" ON "LiquidacionGastoHistorico"("liquidacionId");
CREATE INDEX "LiquidacionGastoHistorico_liquidacionId_tipoExpensa_idx" ON "LiquidacionGastoHistorico"("liquidacionId", "tipoExpensa");
CREATE INDEX "LiquidacionGastoHistorico_liquidacionId_rubroExpensa_idx" ON "LiquidacionGastoHistorico"("liquidacionId", "rubroExpensa");

INSERT INTO "LiquidacionGastoHistorico" (
  "liquidacionId", "gastoOrigenId", "fecha", "periodo", "concepto", "descripcion", "tipoExpensa", "rubroExpensa", "monto", "proveedorNombre", "createdAt"
)
SELECT
  g."liquidacionId",
  g."id",
  g."fecha",
  g."periodo",
  g."concepto",
  g."descripcion",
  g."tipoExpensa",
  g."rubroExpensa",
  g."monto",
  p."nombre",
  CURRENT_TIMESTAMP
FROM "Gasto" g
LEFT JOIN "Proveedor" p ON p."id" = g."proveedorId"
LEFT JOIN "LiquidacionGastoHistorico" h ON h."gastoOrigenId" = g."id"
WHERE g."liquidacionId" IS NOT NULL
  AND h."id" IS NULL;
