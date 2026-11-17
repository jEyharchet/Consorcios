-- CreateTable
CREATE TABLE "Ejercicio" (
    "id" SERIAL NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "fechaFin" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "fundamento" TEXT,
    "aperturaEstado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "aperturaConfirmadaAt" TIMESTAMP(3),
    "aperturaConfirmadaPorUserId" TEXT,
    "aperturaObservaciones" TEXT,
    "vencimientoRendicion" DATE NOT NULL,
    "observaciones" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ejercicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ejercicio_consorcioId_fechaInicio_idx" ON "Ejercicio"("consorcioId", "fechaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "Ejercicio_consorcioId_numero_key" ON "Ejercicio"("consorcioId", "numero");

-- AddForeignKey
ALTER TABLE "Ejercicio" ADD CONSTRAINT "Ejercicio_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Fechas coherentes (Prisma no modela CHECK; la superposición se valida en src/lib/ejercicios.ts)
ALTER TABLE "Ejercicio" ADD CONSTRAINT "Ejercicio_fechas_check" CHECK ("fechaFin" >= "fechaInicio" AND "vencimientoRendicion" >= "fechaFin");
