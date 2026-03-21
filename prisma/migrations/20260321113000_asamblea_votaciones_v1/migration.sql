CREATE TABLE "AsambleaVotacion" (
  "id" SERIAL NOT NULL,
  "asambleaOrdenDiaId" INTEGER NOT NULL,
  "cuestion" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AsambleaVotacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AsambleaVotacionVoto" (
  "id" SERIAL NOT NULL,
  "votacionId" INTEGER NOT NULL,
  "personaId" INTEGER NOT NULL,
  "valor" TEXT NOT NULL,
  "votadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "registradoPorAdministrador" BOOLEAN NOT NULL DEFAULT false,
  "registradoPorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AsambleaVotacionVoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AsambleaVotacionVoto_votacionId_personaId_key"
  ON "AsambleaVotacionVoto"("votacionId", "personaId");

CREATE INDEX "AsambleaVotacion_asambleaOrdenDiaId_idx"
  ON "AsambleaVotacion"("asambleaOrdenDiaId");

CREATE INDEX "AsambleaVotacion_estado_idx"
  ON "AsambleaVotacion"("estado");

CREATE INDEX "AsambleaVotacionVoto_votacionId_idx"
  ON "AsambleaVotacionVoto"("votacionId");

CREATE INDEX "AsambleaVotacionVoto_personaId_idx"
  ON "AsambleaVotacionVoto"("personaId");

CREATE INDEX "AsambleaVotacionVoto_registradoPorUserId_idx"
  ON "AsambleaVotacionVoto"("registradoPorUserId");

CREATE INDEX "AsambleaVotacionVoto_votacionId_valor_idx"
  ON "AsambleaVotacionVoto"("votacionId", "valor");

ALTER TABLE "AsambleaVotacion"
  ADD CONSTRAINT "AsambleaVotacion_asambleaOrdenDiaId_fkey"
  FOREIGN KEY ("asambleaOrdenDiaId") REFERENCES "AsambleaOrdenDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AsambleaVotacionVoto"
  ADD CONSTRAINT "AsambleaVotacionVoto_votacionId_fkey"
  FOREIGN KEY ("votacionId") REFERENCES "AsambleaVotacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AsambleaVotacionVoto"
  ADD CONSTRAINT "AsambleaVotacionVoto_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AsambleaVotacionVoto"
  ADD CONSTRAINT "AsambleaVotacionVoto_registradoPorUserId_fkey"
  FOREIGN KEY ("registradoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
