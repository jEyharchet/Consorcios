-- AlterTable
ALTER TABLE "LiquidacionArchivo" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LiquidacionArchivo" ADD COLUMN "reemplazadoAt" DATETIME;

-- Backfill
UPDATE "LiquidacionArchivo" SET "activo" = true WHERE "activo" IS NULL;

-- CreateIndex
CREATE INDEX "LiquidacionArchivo_liquidacionId_activo_idx" ON "LiquidacionArchivo"("liquidacionId", "activo");
