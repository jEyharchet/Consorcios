import { normalizePeriodo } from "./periodo";
import { prisma } from "./prisma";

export type EstadoCuentaDisplay = {
  saldoAnterior: number;
  pagosPeriodo: number;
};

function buildPeriodoBounds(periodo: string) {
  const normalized = normalizePeriodo(periodo);

  if (!normalized) {
    return null;
  }

  const [year, month] = normalized.split("-").map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  return { start, end };
}

export async function buildEstadoCuentaDisplayByUnidad(params: {
  consorcioId: number;
  liquidacionId: number;
  periodo: string;
}) {
  const { consorcioId, liquidacionId, periodo } = params;
  const periodoBounds = buildPeriodoBounds(periodo);

  if (periodoBounds === null) {
    return new Map<number, EstadoCuentaDisplay>();
  }

  const periodoActual = normalizePeriodo(periodo);

  const expensasPrevias = await prisma.expensa.findMany({
    where: {
      unidad: { consorcioId },
      liquidacionId: { not: liquidacionId },
    },
    select: {
      saldo: true,
      unidadId: true,
      pagos: {
        select: {
          monto: true,
          fechaPago: true,
        },
      },
      liquidacion: {
        select: {
          periodo: true,
        },
      },
    },
  });

  const displayByUnidad = new Map<number, EstadoCuentaDisplay>();

  for (const expensa of expensasPrevias) {
    const periodoExpensa = normalizePeriodo(expensa.liquidacion.periodo);

    if (periodoActual && periodoExpensa && periodoExpensa >= periodoActual) {
      continue;
    }

    if (!periodoActual && !periodoExpensa) {
      continue;
    }

    const pagosDesdeInicioPeriodo = expensa.pagos.reduce((acc, pago) => {
      if (pago.fechaPago >= periodoBounds.start) {
        return acc + pago.monto;
      }

      return acc;
    }, 0);

    const pagosDurantePeriodo = expensa.pagos.reduce((acc, pago) => {
      if (pago.fechaPago >= periodoBounds.start && pago.fechaPago < periodoBounds.end) {
        return acc + pago.monto;
      }

      return acc;
    }, 0);

    const saldoAnteriorReconstruido = Math.max(0, expensa.saldo + pagosDesdeInicioPeriodo);

    if (saldoAnteriorReconstruido <= 0 && pagosDurantePeriodo <= 0) {
      continue;
    }

    const current = displayByUnidad.get(expensa.unidadId) ?? { saldoAnterior: 0, pagosPeriodo: 0 };
    current.saldoAnterior += saldoAnteriorReconstruido;
    current.pagosPeriodo += pagosDurantePeriodo;
    displayByUnidad.set(expensa.unidadId, current);
  }

  return displayByUnidad;
}
