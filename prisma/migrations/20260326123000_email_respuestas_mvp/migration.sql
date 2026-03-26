-- AlterTable
ALTER TABLE "EnvioEmail"
ADD COLUMN "replyKey" TEXT;

-- CreateTable
CREATE TABLE "RespuestaEmail" (
    "id" SERIAL NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "envioEmailId" INTEGER,
    "asambleaId" INTEGER,
    "personaId" INTEGER,
    "fromEmail" TEXT NOT NULL,
    "fromNombre" TEXT,
    "toEmail" TEXT,
    "subject" TEXT NOT NULL,
    "bodyTexto" TEXT,
    "bodyHtml" TEXT,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespuestaEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnvioEmail_replyKey_key" ON "EnvioEmail"("replyKey");

-- CreateIndex
CREATE INDEX "EnvioEmail_providerMessageId_idx" ON "EnvioEmail"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "RespuestaEmail_messageId_key" ON "RespuestaEmail"("messageId");

-- CreateIndex
CREATE INDEX "RespuestaEmail_consorcioId_idx" ON "RespuestaEmail"("consorcioId");

-- CreateIndex
CREATE INDEX "RespuestaEmail_envioEmailId_idx" ON "RespuestaEmail"("envioEmailId");

-- CreateIndex
CREATE INDEX "RespuestaEmail_asambleaId_idx" ON "RespuestaEmail"("asambleaId");

-- CreateIndex
CREATE INDEX "RespuestaEmail_personaId_idx" ON "RespuestaEmail"("personaId");

-- CreateIndex
CREATE INDEX "RespuestaEmail_estado_receivedAt_idx" ON "RespuestaEmail"("estado", "receivedAt");

-- CreateIndex
CREATE INDEX "RespuestaEmail_receivedAt_idx" ON "RespuestaEmail"("receivedAt");

-- CreateIndex
CREATE INDEX "RespuestaEmail_fromEmail_idx" ON "RespuestaEmail"("fromEmail");

-- CreateIndex
CREATE INDEX "RespuestaEmail_inReplyTo_idx" ON "RespuestaEmail"("inReplyTo");

-- AddForeignKey
ALTER TABLE "RespuestaEmail"
ADD CONSTRAINT "RespuestaEmail_consorcioId_fkey"
FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEmail"
ADD CONSTRAINT "RespuestaEmail_envioEmailId_fkey"
FOREIGN KEY ("envioEmailId") REFERENCES "EnvioEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEmail"
ADD CONSTRAINT "RespuestaEmail_asambleaId_fkey"
FOREIGN KEY ("asambleaId") REFERENCES "Asamblea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEmail"
ADD CONSTRAINT "RespuestaEmail_personaId_fkey"
FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
