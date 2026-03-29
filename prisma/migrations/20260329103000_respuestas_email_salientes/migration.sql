-- CreateTable
CREATE TABLE "RespuestaEmailSaliente" (
    "id" SERIAL NOT NULL,
    "respuestaEmailId" INTEGER NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "enviadoPorUserId" TEXT,
    "envioEmailId" INTEGER,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyTexto" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespuestaEmailSaliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RespuestaEmailSaliente_envioEmailId_key" ON "RespuestaEmailSaliente"("envioEmailId");

-- CreateIndex
CREATE INDEX "RespuestaEmailSaliente_respuestaEmailId_sentAt_idx" ON "RespuestaEmailSaliente"("respuestaEmailId", "sentAt");

-- CreateIndex
CREATE INDEX "RespuestaEmailSaliente_consorcioId_sentAt_idx" ON "RespuestaEmailSaliente"("consorcioId", "sentAt");

-- CreateIndex
CREATE INDEX "RespuestaEmailSaliente_enviadoPorUserId_idx" ON "RespuestaEmailSaliente"("enviadoPorUserId");

-- CreateIndex
CREATE INDEX "RespuestaEmailSaliente_sentAt_idx" ON "RespuestaEmailSaliente"("sentAt");

-- AddForeignKey
ALTER TABLE "RespuestaEmailSaliente"
ADD CONSTRAINT "RespuestaEmailSaliente_respuestaEmailId_fkey"
FOREIGN KEY ("respuestaEmailId") REFERENCES "RespuestaEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEmailSaliente"
ADD CONSTRAINT "RespuestaEmailSaliente_consorcioId_fkey"
FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEmailSaliente"
ADD CONSTRAINT "RespuestaEmailSaliente_enviadoPorUserId_fkey"
FOREIGN KEY ("enviadoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEmailSaliente"
ADD CONSTRAINT "RespuestaEmailSaliente_envioEmailId_fkey"
FOREIGN KEY ("envioEmailId") REFERENCES "EnvioEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
