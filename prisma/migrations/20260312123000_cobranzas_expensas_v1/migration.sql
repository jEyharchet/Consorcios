ALTER TABLE "Pago"
  ADD COLUMN "capitalPendientePrevio" DOUBLE PRECISION,
  ADD COLUMN "interesDevengado" DOUBLE PRECISION,
  ADD COLUMN "totalAdeudadoPrevio" DOUBLE PRECISION,
  ADD COLUMN "montoCapital" DOUBLE PRECISION,
  ADD COLUMN "montoInteres" DOUBLE PRECISION,
  ADD COLUMN "saldoResultante" DOUBLE PRECISION,
  ADD COLUMN "comprobanteNombreOriginal" TEXT,
  ADD COLUMN "comprobanteMimeType" TEXT,
  ADD COLUMN "comprobanteContenido" BYTEA,
  ADD COLUMN "comprobanteSubidoAt" TIMESTAMP(3),
  ADD COLUMN "registradoPorUserId" TEXT;

ALTER TABLE "Pago"
  ADD CONSTRAINT "Pago_registradoPorUserId_fkey"
  FOREIGN KEY ("registradoPorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Pago_registradoPorUserId_idx" ON "Pago"("registradoPorUserId");
