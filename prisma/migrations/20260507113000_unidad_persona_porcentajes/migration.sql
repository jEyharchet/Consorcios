ALTER TYPE "TipoRelacionUnidad" RENAME TO "TipoRelacionUnidad_old";

CREATE TYPE "TipoRelacionUnidad" AS ENUM ('RESPONSABLE', 'DUENO', 'INQUILINO');

ALTER TABLE "UnidadPersona"
ADD COLUMN "__wasInquilinoExp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "porcentajeExpensasOrdinarias" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "porcentajeExpensasExtraordinarias" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "recibeLiquidacion" BOOLEAN NOT NULL DEFAULT false;

UPDATE "UnidadPersona"
SET "__wasInquilinoExp" = true
WHERE "tipoRelacion"::text = 'INQUILINO_EXP';

ALTER TABLE "UnidadPersona"
ALTER COLUMN "tipoRelacion" DROP DEFAULT;

ALTER TABLE "UnidadPersona"
ALTER COLUMN "tipoRelacion" TYPE "TipoRelacionUnidad"
USING (
  CASE
    WHEN "tipoRelacion"::text = 'INQUILINO_EXP' THEN 'INQUILINO'
    ELSE "tipoRelacion"::text
  END
)::"TipoRelacionUnidad";

ALTER TABLE "UnidadPersona"
ALTER COLUMN "tipoRelacion" SET DEFAULT 'RESPONSABLE';

WITH active_inquilinos_exp AS (
  SELECT "unidadId", COUNT(*)::DOUBLE PRECISION AS cantidad
  FROM "UnidadPersona"
  WHERE "__wasInquilinoExp" = true
    AND "desde"::date <= CURRENT_DATE
    AND ("hasta" IS NULL OR "hasta"::date >= CURRENT_DATE)
  GROUP BY "unidadId"
)
UPDATE "UnidadPersona" up
SET
  "porcentajeExpensasOrdinarias" = ROUND((100.0 / active_inquilinos_exp.cantidad)::numeric, 4)::double precision,
  "porcentajeExpensasExtraordinarias" = ROUND((100.0 / active_inquilinos_exp.cantidad)::numeric, 4)::double precision,
  "recibeLiquidacion" = false
FROM active_inquilinos_exp
WHERE up."unidadId" = active_inquilinos_exp."unidadId"
  AND up."__wasInquilinoExp" = true
  AND up."desde"::date <= CURRENT_DATE
  AND (up."hasta" IS NULL OR up."hasta"::date >= CURRENT_DATE);

WITH unidades_con_inquilino_exp AS (
  SELECT DISTINCT "unidadId"
  FROM "UnidadPersona"
  WHERE "__wasInquilinoExp" = true
    AND "desde"::date <= CURRENT_DATE
    AND ("hasta" IS NULL OR "hasta"::date >= CURRENT_DATE)
),
active_responsables AS (
  SELECT "unidadId", COUNT(*)::DOUBLE PRECISION AS cantidad
  FROM "UnidadPersona"
  WHERE "tipoRelacion" = 'RESPONSABLE'
    AND "unidadId" NOT IN (SELECT "unidadId" FROM unidades_con_inquilino_exp)
    AND "desde"::date <= CURRENT_DATE
    AND ("hasta" IS NULL OR "hasta"::date >= CURRENT_DATE)
  GROUP BY "unidadId"
)
UPDATE "UnidadPersona" up
SET
  "porcentajeExpensasOrdinarias" = ROUND((100.0 / active_responsables.cantidad)::numeric, 4)::double precision,
  "porcentajeExpensasExtraordinarias" = ROUND((100.0 / active_responsables.cantidad)::numeric, 4)::double precision
FROM active_responsables
WHERE up."unidadId" = active_responsables."unidadId"
  AND up."tipoRelacion" = 'RESPONSABLE'
  AND up."desde"::date <= CURRENT_DATE
  AND (up."hasta" IS NULL OR up."hasta"::date >= CURRENT_DATE);

WITH unidades_con_inquilino_exp AS (
  SELECT DISTINCT "unidadId"
  FROM "UnidadPersona"
  WHERE "__wasInquilinoExp" = true
    AND "desde"::date <= CURRENT_DATE
    AND ("hasta" IS NULL OR "hasta"::date >= CURRENT_DATE)
),
unidades_con_responsable AS (
  SELECT DISTINCT "unidadId"
  FROM "UnidadPersona"
  WHERE "tipoRelacion" = 'RESPONSABLE'
    AND "unidadId" NOT IN (SELECT "unidadId" FROM unidades_con_inquilino_exp)
    AND "desde"::date <= CURRENT_DATE
    AND ("hasta" IS NULL OR "hasta"::date >= CURRENT_DATE)
),
active_fallback AS (
  SELECT "unidadId", COUNT(*)::DOUBLE PRECISION AS cantidad
  FROM "UnidadPersona"
  WHERE "unidadId" NOT IN (SELECT "unidadId" FROM unidades_con_inquilino_exp)
    AND "unidadId" NOT IN (SELECT "unidadId" FROM unidades_con_responsable)
    AND "desde"::date <= CURRENT_DATE
    AND ("hasta" IS NULL OR "hasta"::date >= CURRENT_DATE)
  GROUP BY "unidadId"
)
UPDATE "UnidadPersona" up
SET
  "porcentajeExpensasOrdinarias" = ROUND((100.0 / active_fallback.cantidad)::numeric, 4)::double precision,
  "porcentajeExpensasExtraordinarias" = ROUND((100.0 / active_fallback.cantidad)::numeric, 4)::double precision
FROM active_fallback
WHERE up."unidadId" = active_fallback."unidadId"
  AND up."desde"::date <= CURRENT_DATE
  AND (up."hasta" IS NULL OR up."hasta"::date >= CURRENT_DATE);

ALTER TABLE "UnidadPersona"
DROP COLUMN "__wasInquilinoExp";

DROP TYPE "TipoRelacionUnidad_old";
