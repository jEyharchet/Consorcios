CREATE TABLE IF NOT EXISTS "PagoGasto" (
  "id" SERIAL NOT NULL,
  "gastoId" INTEGER NOT NULL,
  "consorcioId" INTEGER NOT NULL,
  "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "monto" DOUBLE PRECISION NOT NULL,
  "medioPago" TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
  "consorcioCuentaBancariaId" INTEGER,
  "observacion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PagoGasto_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MovimientoFondo"
  ADD COLUMN IF NOT EXISTS "pagoGastoId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "MovimientoFondo_pagoGastoId_key" ON "MovimientoFondo"("pagoGastoId");
CREATE INDEX IF NOT EXISTS "MovimientoFondo_pagoGastoId_idx" ON "MovimientoFondo"("pagoGastoId");
CREATE INDEX IF NOT EXISTS "PagoGasto_gastoId_idx" ON "PagoGasto"("gastoId");
CREATE INDEX IF NOT EXISTS "PagoGasto_consorcioId_idx" ON "PagoGasto"("consorcioId");
CREATE INDEX IF NOT EXISTS "PagoGasto_fechaPago_idx" ON "PagoGasto"("fechaPago");
CREATE INDEX IF NOT EXISTS "PagoGasto_consorcioCuentaBancariaId_idx" ON "PagoGasto"("consorcioCuentaBancariaId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PagoGasto_gastoId_fkey'
  ) THEN
    ALTER TABLE "PagoGasto"
      ADD CONSTRAINT "PagoGasto_gastoId_fkey"
      FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PagoGasto_consorcioId_fkey'
  ) THEN
    ALTER TABLE "PagoGasto"
      ADD CONSTRAINT "PagoGasto_consorcioId_fkey"
      FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PagoGasto_consorcioCuentaBancariaId_fkey'
  ) THEN
    ALTER TABLE "PagoGasto"
      ADD CONSTRAINT "PagoGasto_consorcioCuentaBancariaId_fkey"
      FOREIGN KEY ("consorcioCuentaBancariaId") REFERENCES "ConsorcioCuentaBancaria"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MovimientoFondo_pagoGastoId_fkey'
  ) THEN
    ALTER TABLE "MovimientoFondo"
      ADD CONSTRAINT "MovimientoFondo_pagoGastoId_fkey"
      FOREIGN KEY ("pagoGastoId") REFERENCES "PagoGasto"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
