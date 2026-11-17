-- Cierra en la expensa original la deuda que una liquidación finalizada ya
-- trasladó (LiquidacionDeuda). Antes, la expensa original seguía con saldo y se
-- contaba dos veces. Mismo criterio que src/lib/expensa-traslado.ts:
-- TOTAL/CAPITAL trasladan el capital; PARCIAL, el importe liquidado hasta el
-- capital; INTERES no traslada capital. Solo afecta expensas PENDIENTE/PARCIAL.
WITH trasladado AS (
  SELECT
    ld."expensaId",
    SUM(
      CASE
        WHEN ld."criterio" IN ('TOTAL', 'CAPITAL') THEN ld."capitalOriginal"
        WHEN ld."criterio" = 'PARCIAL' THEN LEAST(ld."importeLiquidado", ld."capitalOriginal")
        ELSE 0
      END
    ) AS capital
  FROM "LiquidacionDeuda" ld
  JOIN "Liquidacion" l ON l."id" = ld."liquidacionId"
  WHERE l."estado" IN ('FINALIZADA', 'CERRADA')
  GROUP BY ld."expensaId"
)
UPDATE "Expensa" e
SET
  "saldo" = GREATEST(0, ROUND((e."saldo" - t.capital)::numeric, 2))::double precision,
  "estado" = CASE WHEN e."saldo" - t.capital <= 0.009 THEN 'TRASLADADA' ELSE e."estado" END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM trasladado t
WHERE e."id" = t."expensaId"
  AND e."estado" IN ('PENDIENTE', 'PARCIAL')
  AND t.capital > 0;
