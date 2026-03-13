ALTER TABLE "Consorcio"
  ADD COLUMN "saldoCajaActual" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ConsorcioCuentaBancaria"
  ADD COLUMN "tipoCuenta" TEXT,
  ADD COLUMN "numeroCuenta" TEXT,
  ADD COLUMN "saldoActual" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Pago"
  ADD COLUMN "consorcioCuentaBancariaId" INTEGER;

CREATE TABLE "MovimientoFondo" (
  "id" SERIAL NOT NULL,
  "consorcioId" INTEGER NOT NULL,
  "pagoId" INTEGER NOT NULL,
  "consorcioCuentaBancariaId" INTEGER,
  "fechaMovimiento" TIMESTAMP(3) NOT NULL,
  "tipoOrigen" TEXT NOT NULL,
  "tipoDestino" TEXT NOT NULL,
  "descripcion" TEXT,
  "monto" DOUBLE PRECISION NOT NULL,
  "saldoAnterior" DOUBLE PRECISION NOT NULL,
  "saldoPosterior" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MovimientoFondo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MovimientoFondo_pagoId_key" ON "MovimientoFondo"("pagoId");
CREATE INDEX "Pago_consorcioCuentaBancariaId_idx" ON "Pago"("consorcioCuentaBancariaId");
CREATE INDEX "MovimientoFondo_consorcioId_idx" ON "MovimientoFondo"("consorcioId");
CREATE INDEX "MovimientoFondo_consorcioCuentaBancariaId_idx" ON "MovimientoFondo"("consorcioCuentaBancariaId");
CREATE INDEX "MovimientoFondo_fechaMovimiento_idx" ON "MovimientoFondo"("fechaMovimiento");

ALTER TABLE "Pago"
  ADD CONSTRAINT "Pago_consorcioCuentaBancariaId_fkey"
  FOREIGN KEY ("consorcioCuentaBancariaId") REFERENCES "ConsorcioCuentaBancaria"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MovimientoFondo"
  ADD CONSTRAINT "MovimientoFondo_consorcioId_fkey"
  FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovimientoFondo"
  ADD CONSTRAINT "MovimientoFondo_pagoId_fkey"
  FOREIGN KEY ("pagoId") REFERENCES "Pago"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovimientoFondo"
  ADD CONSTRAINT "MovimientoFondo_consorcioCuentaBancariaId_fkey"
  FOREIGN KEY ("consorcioCuentaBancariaId") REFERENCES "ConsorcioCuentaBancaria"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
