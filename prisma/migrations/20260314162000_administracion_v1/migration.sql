CREATE TABLE "Asamblea" (
    "id" SERIAL NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "hora" TEXT NOT NULL,
    "lugar" TEXT NOT NULL,
    "convocatoriaTexto" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "actaTexto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asamblea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AsambleaOrdenDia" (
    "id" SERIAL NOT NULL,
    "asambleaId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsambleaOrdenDia_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EnvioEmail"
ADD COLUMN "consorcioId" INTEGER,
ADD COLUMN "asambleaId" INTEGER,
ADD COLUMN "cuerpo" TEXT;

ALTER TABLE "EnvioEmail"
ALTER COLUMN "liquidacionId" DROP NOT NULL;

UPDATE "EnvioEmail" AS ee
SET "consorcioId" = l."consorcioId"
FROM "Liquidacion" AS l
WHERE ee."liquidacionId" = l."id";

ALTER TABLE "EnvioEmail"
ALTER COLUMN "consorcioId" SET NOT NULL;

CREATE INDEX "Asamblea_consorcioId_idx" ON "Asamblea"("consorcioId");
CREATE INDEX "Asamblea_consorcioId_fecha_idx" ON "Asamblea"("consorcioId", "fecha");
CREATE INDEX "Asamblea_consorcioId_estado_idx" ON "Asamblea"("consorcioId", "estado");
CREATE INDEX "AsambleaOrdenDia_asambleaId_idx" ON "AsambleaOrdenDia"("asambleaId");
CREATE UNIQUE INDEX "AsambleaOrdenDia_asambleaId_orden_key" ON "AsambleaOrdenDia"("asambleaId", "orden");
CREATE INDEX "EnvioEmail_consorcioId_idx" ON "EnvioEmail"("consorcioId");
CREATE INDEX "EnvioEmail_asambleaId_idx" ON "EnvioEmail"("asambleaId");
CREATE INDEX "EnvioEmail_consorcioId_tipoEnvio_createdAt_idx" ON "EnvioEmail"("consorcioId", "tipoEnvio", "createdAt");

ALTER TABLE "Asamblea"
ADD CONSTRAINT "Asamblea_consorcioId_fkey"
FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AsambleaOrdenDia"
ADD CONSTRAINT "AsambleaOrdenDia_asambleaId_fkey"
FOREIGN KEY ("asambleaId") REFERENCES "Asamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnvioEmail"
ADD CONSTRAINT "EnvioEmail_consorcioId_fkey"
FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnvioEmail"
ADD CONSTRAINT "EnvioEmail_asambleaId_fkey"
FOREIGN KEY ("asambleaId") REFERENCES "Asamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
