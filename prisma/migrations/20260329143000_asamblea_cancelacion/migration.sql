ALTER TABLE "Asamblea"
ADD COLUMN "canceladaAt" TIMESTAMP(3),
ADD COLUMN "canceladaPorUserId" TEXT,
ADD COLUMN "cancelacionMensaje" TEXT,
ADD COLUMN "cancelacionPdfNombre" TEXT,
ADD COLUMN "cancelacionEnviadaAt" TIMESTAMP(3);
