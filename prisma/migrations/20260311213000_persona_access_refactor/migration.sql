ALTER TABLE "SolicitudAccesoConsorcio"
ADD COLUMN "personaId" INTEGER,
ADD COLUMN "unidadId" INTEGER;

UPDATE "SolicitudAccesoConsorcio" sac
SET "personaId" = u."personaId"
FROM "User" u
WHERE sac."userId" = u."id"
  AND sac."personaId" IS NULL
  AND u."personaId" IS NOT NULL;

ALTER TABLE "SolicitudAccesoConsorcio"
ADD CONSTRAINT "SolicitudAccesoConsorcio_personaId_fkey"
FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SolicitudAccesoConsorcio"
ADD CONSTRAINT "SolicitudAccesoConsorcio_unidadId_fkey"
FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SolicitudAccesoConsorcio_personaId_estado_idx"
ON "SolicitudAccesoConsorcio"("personaId", "estado");

CREATE INDEX "SolicitudAccesoConsorcio_unidadId_idx"
ON "SolicitudAccesoConsorcio"("unidadId");
