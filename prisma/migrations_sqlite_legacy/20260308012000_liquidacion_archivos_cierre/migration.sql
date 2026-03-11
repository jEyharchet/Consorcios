-- CreateTable
CREATE TABLE "LiquidacionArchivo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "liquidacionId" INTEGER NOT NULL,
    "tipoArchivo" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "rutaArchivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "responsableGroupKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiquidacionArchivo_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LiquidacionArchivo_liquidacionId_idx" ON "LiquidacionArchivo"("liquidacionId");

-- CreateIndex
CREATE INDEX "LiquidacionArchivo_tipoArchivo_idx" ON "LiquidacionArchivo"("tipoArchivo");
