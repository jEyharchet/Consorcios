-- CreateEnum
CREATE TYPE "TipoRelacionUnidad" AS ENUM ('RESPONSABLE', 'DUENO', 'INQUILINO', 'INQUILINO_EXP');

-- AlterTable
ALTER TABLE "UnidadPersona"
ADD COLUMN "tipoRelacion" "TipoRelacionUnidad" NOT NULL DEFAULT 'RESPONSABLE';

-- Backfill existing relations as DUENO
UPDATE "UnidadPersona"
SET "tipoRelacion" = 'DUENO'
WHERE "tipoRelacion" = 'RESPONSABLE';
