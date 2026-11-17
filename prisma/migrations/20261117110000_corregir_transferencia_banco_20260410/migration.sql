-- Jara 166: la transferencia banco -> caja del 10/04/2026 quedó registrada en el
-- banco como 47.999,99 (redondeo al convertir Float) cuando el importe real es
-- 48.000, igual que el ingreso en caja. Se corrige el movimiento y se baja 0,01
-- el saldo anterior/posterior de los movimientos cargados después en esa
-- cuenta, y el saldo actual de la cuenta. Si el movimiento no existe con ese
-- importe (otra base o ya corregido), no hace nada.
DO $$
DECLARE
  mov RECORD;
BEGIN
  SELECT "id", "consorcioCuentaBancariaId" INTO mov
  FROM "MovimientoFondo"
  WHERE "tipoOrigen" = 'AJUSTE_MANUAL'
    AND "tipoDestino" = 'CUENTA_BANCARIA'
    AND "naturaleza" = 'DISMINUCION'
    AND "monto" = 47999.99
    AND "fechaMovimiento"::date = DATE '2026-04-10'
  LIMIT 1;

  IF mov."id" IS NULL THEN
    RETURN;
  END IF;

  UPDATE "MovimientoFondo"
  SET "monto" = 48000,
      "saldoPosterior" = ROUND(("saldoAnterior" - 48000)::numeric, 2)::double precision
  WHERE "id" = mov."id";

  UPDATE "MovimientoFondo"
  SET "saldoAnterior" = ROUND(("saldoAnterior" - 0.01)::numeric, 2)::double precision,
      "saldoPosterior" = ROUND(("saldoPosterior" - 0.01)::numeric, 2)::double precision
  WHERE "consorcioCuentaBancariaId" = mov."consorcioCuentaBancariaId"
    AND "id" > mov."id";

  UPDATE "ConsorcioCuentaBancaria"
  SET "saldoActual" = ROUND(("saldoActual" - 0.01)::numeric, 2)::double precision,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = mov."consorcioCuentaBancariaId";
END $$;
