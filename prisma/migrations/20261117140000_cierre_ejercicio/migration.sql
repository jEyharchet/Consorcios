-- Confirmación y reapertura del cierre de ejercicios, notas de la rendición,
-- detalle de apertura y envíos de la rendición.

-- AlterTable
ALTER TABLE "Ejercicio" ADD COLUMN     "aperturaDetalle" JSONB,
ADD COLUMN     "notasRendicion" TEXT;

-- AlterTable
ALTER TABLE "EnvioEmail" ADD COLUMN     "cierreEjercicioId" INTEGER;

-- CreateTable
CREATE TABLE "CierreEjercicio" (
    "id" SERIAL NOT NULL,
    "ejercicioId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "confirmadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoPorUserId" TEXT,
    "notas" TEXT,
    "resultados" JSONB NOT NULL,
    "huella" TEXT NOT NULL,
    "rendicionPdf" BYTEA NOT NULL,
    "hojaLibroPdf" BYTEA NOT NULL,
    "comprobantesAnexados" INTEGER NOT NULL DEFAULT 0,
    "reabiertoAt" TIMESTAMP(3),
    "reabiertoPorUserId" TEXT,
    "motivoReapertura" TEXT,
    "presentadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreEjercicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CierreEjercicio_ejercicioId_estado_idx" ON "CierreEjercicio"("ejercicioId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "CierreEjercicio_ejercicioId_version_key" ON "CierreEjercicio"("ejercicioId", "version");

-- CreateIndex
CREATE INDEX "EnvioEmail_cierreEjercicioId_idx" ON "EnvioEmail"("cierreEjercicioId");

-- AddForeignKey
ALTER TABLE "CierreEjercicio" ADD CONSTRAINT "CierreEjercicio_ejercicioId_fkey" FOREIGN KEY ("ejercicioId") REFERENCES "Ejercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioEmail" ADD CONSTRAINT "EnvioEmail_cierreEjercicioId_fkey" FOREIGN KEY ("cierreEjercicioId") REFERENCES "CierreEjercicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Un solo cierre vigente por ejercicio (evita una doble confirmación). Prisma no modela índices parciales.
CREATE UNIQUE INDEX "CierreEjercicio_ejercicioId_vigente_key" ON "CierreEjercicio"("ejercicioId") WHERE "estado" = 'VIGENTE';
