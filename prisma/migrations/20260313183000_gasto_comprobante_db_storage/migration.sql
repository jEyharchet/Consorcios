ALTER TABLE "Gasto"
  ADD COLUMN IF NOT EXISTS "comprobanteContenido" BYTEA,
  ADD COLUMN IF NOT EXISTS "comprobanteMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "comprobanteNombreOriginal" TEXT,
  ADD COLUMN IF NOT EXISTS "comprobanteSubidoAt" TIMESTAMP(3);
