ALTER TABLE "Consorcio"
  ADD COLUMN IF NOT EXISTS "saldoCajaActual" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ConsorcioCuentaBancaria"
  ADD COLUMN IF NOT EXISTS "tipoCuenta" TEXT,
  ADD COLUMN IF NOT EXISTS "numeroCuenta" TEXT,
  ADD COLUMN IF NOT EXISTS "saldoActual" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Pago"
  ADD COLUMN IF NOT EXISTS "consorcioCuentaBancariaId" INTEGER;

CREATE TABLE IF NOT EXISTS "MovimientoFondo" (
  "id" SERIAL NOT NULL,
  "consorcioId" INTEGER NOT NULL,
  "pagoId" INTEGER,
  "consorcioCuentaBancariaId" INTEGER,
  "fechaMovimiento" TIMESTAMP(3) NOT NULL,
  "tipoOrigen" TEXT NOT NULL,
  "tipoDestino" TEXT NOT NULL,
  "naturaleza" TEXT NOT NULL DEFAULT 'INCREMENTO',
  "descripcion" TEXT,
  "monto" DOUBLE PRECISION NOT NULL,
  "saldoAnterior" DOUBLE PRECISION NOT NULL,
  "saldoPosterior" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MovimientoFondo_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MovimientoFondo"
  ADD COLUMN IF NOT EXISTS "naturaleza" TEXT NOT NULL DEFAULT 'INCREMENTO';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'MovimientoFondo'
      AND column_name = 'pagoId'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "MovimientoFondo"
      ALTER COLUMN "pagoId" DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pago_consorcioCuentaBancariaId_idx" ON "Pago"("consorcioCuentaBancariaId");
CREATE INDEX IF NOT EXISTS "MovimientoFondo_consorcioId_idx" ON "MovimientoFondo"("consorcioId");
CREATE INDEX IF NOT EXISTS "MovimientoFondo_consorcioCuentaBancariaId_idx" ON "MovimientoFondo"("consorcioCuentaBancariaId");
CREATE INDEX IF NOT EXISTS "MovimientoFondo_fechaMovimiento_idx" ON "MovimientoFondo"("fechaMovimiento");
CREATE UNIQUE INDEX IF NOT EXISTS "MovimientoFondo_pagoId_key" ON "MovimientoFondo"("pagoId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Pago_consorcioCuentaBancariaId_fkey'
  ) THEN
    ALTER TABLE "Pago"
      ADD CONSTRAINT "Pago_consorcioCuentaBancariaId_fkey"
      FOREIGN KEY ("consorcioCuentaBancariaId") REFERENCES "ConsorcioCuentaBancaria"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MovimientoFondo_consorcioId_fkey'
  ) THEN
    ALTER TABLE "MovimientoFondo"
      ADD CONSTRAINT "MovimientoFondo_consorcioId_fkey"
      FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MovimientoFondo_pagoId_fkey'
  ) THEN
    ALTER TABLE "MovimientoFondo"
      ADD CONSTRAINT "MovimientoFondo_pagoId_fkey"
      FOREIGN KEY ("pagoId") REFERENCES "Pago"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MovimientoFondo_consorcioCuentaBancariaId_fkey'
  ) THEN
    ALTER TABLE "MovimientoFondo"
      ADD CONSTRAINT "MovimientoFondo_consorcioCuentaBancariaId_fkey"
      FOREIGN KEY ("consorcioCuentaBancariaId") REFERENCES "ConsorcioCuentaBancaria"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
