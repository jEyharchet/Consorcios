ALTER TABLE "EnvioEmail"
ADD COLUMN "grupoEnvioKey" TEXT,
ADD COLUMN "intento" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "destinatarioNombre" TEXT,
ADD COLUMN "unidadIdsCsv" TEXT,
ADD COLUMN "unidadesIncluidas" TEXT,
ADD COLUMN "responsableIdsCsv" TEXT,
ADD COLUMN "boletaUrl" TEXT,
ADD COLUMN "rendicionUrl" TEXT;

CREATE INDEX "EnvioEmail_liquidacionId_tipoEnvio_grupoEnvioKey_createdAt_idx"
ON "EnvioEmail"("liquidacionId", "tipoEnvio", "grupoEnvioKey", "createdAt");
