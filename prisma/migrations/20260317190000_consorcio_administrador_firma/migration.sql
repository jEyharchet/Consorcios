ALTER TABLE "ConsorcioAdministrador"
ADD COLUMN "firmaNombreOriginal" TEXT,
ADD COLUMN "firmaMimeType" TEXT,
ADD COLUMN "firmaPath" TEXT,
ADD COLUMN "firmaContenido" BYTEA,
ADD COLUMN "firmaSubidaAt" TIMESTAMP(3),
ADD COLUMN "firmaAclaracion" TEXT,
ADD COLUMN "firmaRol" TEXT;
