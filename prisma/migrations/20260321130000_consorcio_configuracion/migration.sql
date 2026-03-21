CREATE TABLE "ConsorcioConfiguracion" (
  "id" TEXT NOT NULL,
  "consorcioId" INTEGER NOT NULL,
  "cocherasModo" TEXT NOT NULL,
  "votoTipo" TEXT NOT NULL,
  "votoMultiplesDueno" TEXT NOT NULL,
  "votoMultiplesUnidad" TEXT NOT NULL,
  "votoPeso" TEXT NOT NULL,
  "plazoTipo" TEXT NOT NULL,
  "plazoDias" INTEGER NOT NULL,
  "votoDefault" TEXT NOT NULL,
  "enviarCopiaAdmin" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsorcioConfiguracion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsorcioConfiguracion_consorcioId_key"
  ON "ConsorcioConfiguracion"("consorcioId");

CREATE INDEX "ConsorcioConfiguracion_consorcioId_idx"
  ON "ConsorcioConfiguracion"("consorcioId");

ALTER TABLE "ConsorcioConfiguracion"
  ADD CONSTRAINT "ConsorcioConfiguracion_consorcioId_fkey"
  FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ConsorcioConfiguracion" (
  "id",
  "consorcioId",
  "cocherasModo",
  "votoTipo",
  "votoMultiplesDueno",
  "votoMultiplesUnidad",
  "votoPeso",
  "plazoTipo",
  "plazoDias",
  "votoDefault",
  "enviarCopiaAdmin",
  "createdAt",
  "updatedAt"
)
SELECT
  'cfg_' || md5(random()::text || clock_timestamp()::text || c."id"::text),
  c."id",
  'TODAS',
  'PERSONA',
  'INDIVIDUAL',
  'MULTIPLES',
  'IGUAL',
  'ENVIO_ACTA',
  15,
  'POSITIVO',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Consorcio" c
WHERE NOT EXISTS (
  SELECT 1
  FROM "ConsorcioConfiguracion" cc
  WHERE cc."consorcioId" = c."id"
);
