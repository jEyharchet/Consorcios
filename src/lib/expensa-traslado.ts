import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

// Traslado de deuda: cuando una liquidación incluye deuda de una expensa
// anterior (LiquidacionDeuda) y se finaliza, ese importe pasa a cobrarse en la
// expensa nueva. La expensa original deja de adeudarlo: baja su saldo y, si no
// queda capital, pasa a estado TRASLADADA. Así la deuda no se cuenta dos veces
// ni sigue generando intereses en la expensa original.

type DbClient = typeof prisma | Prisma.TransactionClient;

export const ESTADO_EXPENSA_TRASLADADA = "TRASLADADA";
export const ESTADOS_LIQUIDACION_CON_TRASLADO = ["FINALIZADA", "CERRADA"];

const EPSILON = 0.009;

export type DeudaTrasladada = {
  criterio: string;
  capitalOriginal: number;
  interesCalculado: number;
  importeLiquidado: number;
};

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Capital que la liquidación posterior pasó a cobrar (mismo criterio que el paso 3 del wizard). */
export function capitalTrasladado(deuda: DeudaTrasladada) {
  switch (deuda.criterio) {
    case "TOTAL":
    case "CAPITAL":
      return redondear(deuda.capitalOriginal);
    case "PARCIAL":
      return redondear(Math.min(deuda.importeLiquidado, deuda.capitalOriginal));
    default:
      return 0;
  }
}

/** Interés que la liquidación posterior pasó a cobrar. */
export function interesTrasladado(deuda: DeudaTrasladada) {
  return deuda.criterio === "TOTAL" || deuda.criterio === "INTERES" ? redondear(deuda.interesCalculado) : 0;
}

/**
 * Aplica los traslados de una liquidación que se está finalizando sobre las
 * expensas originales. Debe llamarse dentro de la misma transacción que marca
 * la liquidación como FINALIZADA.
 */
export async function aplicarTrasladosDeLiquidacion(db: DbClient, liquidacionId: number) {
  const deudas = await db.liquidacionDeuda.findMany({
    where: { liquidacionId },
    select: {
      criterio: true,
      capitalOriginal: true,
      interesCalculado: true,
      importeLiquidado: true,
      expensa: { select: { id: true, saldo: true, estado: true } },
    },
  });

  for (const deuda of deudas) {
    const capital = capitalTrasladado(deuda);
    if (capital <= 0) continue;

    const saldo = redondear(Math.max(0, deuda.expensa.saldo - capital));
    await db.expensa.update({
      where: { id: deuda.expensa.id },
      data: {
        saldo,
        estado: saldo <= EPSILON ? ESTADO_EXPENSA_TRASLADADA : deuda.expensa.estado,
      },
    });
  }
}
