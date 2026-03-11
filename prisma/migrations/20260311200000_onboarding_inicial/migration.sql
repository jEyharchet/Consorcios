ALTER TABLE "User"
ADD COLUMN "personaId" INTEGER;

ALTER TABLE "User"
ADD CONSTRAINT "User_personaId_fkey"
FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_personaId_idx" ON "User"("personaId");

CREATE TABLE "SolicitudAccesoConsorcio" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "mensaje" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "SolicitudAccesoConsorcio_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SolicitudAccesoConsorcio"
ADD CONSTRAINT "SolicitudAccesoConsorcio_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SolicitudAccesoConsorcio"
ADD CONSTRAINT "SolicitudAccesoConsorcio_consorcioId_fkey"
FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SolicitudAccesoConsorcio"
ADD CONSTRAINT "SolicitudAccesoConsorcio_resolvedByUserId_fkey"
FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SolicitudAccesoConsorcio_userId_estado_idx" ON "SolicitudAccesoConsorcio"("userId", "estado");
CREATE INDEX "SolicitudAccesoConsorcio_consorcioId_estado_idx" ON "SolicitudAccesoConsorcio"("consorcioId", "estado");
CREATE INDEX "SolicitudAccesoConsorcio_resolvedByUserId_idx" ON "SolicitudAccesoConsorcio"("resolvedByUserId");
CREATE UNIQUE INDEX "SolicitudAccesoConsorcio_userId_consorcioId_pendiente_key"
ON "SolicitudAccesoConsorcio"("userId", "consorcioId")
WHERE "estado" = 'PENDIENTE';
