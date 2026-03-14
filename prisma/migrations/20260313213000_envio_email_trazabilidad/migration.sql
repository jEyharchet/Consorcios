CREATE TABLE "EnvioEmail" (
    "id" SERIAL NOT NULL,
    "tipoEnvio" TEXT NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "unidadId" INTEGER,
    "destinatario" TEXT,
    "asunto" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "errorMensaje" TEXT,
    "providerMessageId" TEXT,
    "enviadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnvioEmail_liquidacionId_idx" ON "EnvioEmail"("liquidacionId");
CREATE INDEX "EnvioEmail_unidadId_idx" ON "EnvioEmail"("unidadId");
CREATE INDEX "EnvioEmail_tipoEnvio_createdAt_idx" ON "EnvioEmail"("tipoEnvio", "createdAt");
CREATE INDEX "EnvioEmail_estado_createdAt_idx" ON "EnvioEmail"("estado", "createdAt");

ALTER TABLE "EnvioEmail"
ADD CONSTRAINT "EnvioEmail_liquidacionId_fkey"
FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnvioEmail"
ADD CONSTRAINT "EnvioEmail_unidadId_fkey"
FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
