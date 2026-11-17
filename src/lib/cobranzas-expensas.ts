import { Buffer } from "node:buffer";
import { Prisma } from "@prisma/client";

import { calcularInteresCapitalizadoPorTasas, type LiquidacionTasa } from "./liquidacion-deudas";
import {
  ESTADOS_LIQUIDACION_CON_TRASLADO,
  ESTADO_EXPENSA_TRASLADADA,
  capitalTrasladado,
  interesTrasladado,
} from "./expensa-traslado";
import { type MedioPagoExpensa, isMedioPagoExpensa } from "./fondos";
import { prisma } from "./prisma";

const FINAL_ESTADO = "PAGADA";
const EPSILON = 0.00001;

type DbClient = typeof prisma | Prisma.TransactionClient;

type ExpensaWithCobranzaData = {
  id: number;
  monto: number;
  saldo: number;
  estado: string;
  liquidacion: {
    id: number;
    periodo: string;
    fechaEmision: Date;
    fechaVencimiento: Date | null;
    consorcioId: number;
    consorcio: { id: number; nombre: string };
  };
  unidad: {
    id: number;
    identificador: string;
    tipo: string;
    porcentajeExpensas: number | null;
  };
  pagos: Array<{
    id: number;
    fechaPago: Date;
    monto: number;
    interesDevengado: number | null;
    montoCapital: number | null;
    montoInteres: number | null;
    saldoResultante: number | null;
    medioPago: string;
    referencia: string | null;
    nota: string | null;
    createdAt: Date;
    comprobanteNombreOriginal: string | null;
    comprobanteMimeType: string | null;
    registradoPorUserId: string | null;
    registradoPorUser: { id: string; email: string | null; name: string | null } | null;
  }>;
  deudasIncluidas: Array<{
    criterio: string;
    capitalOriginal: number;
    interesCalculado: number;
    importeLiquidado: number;
    fechaCalculoInteres: Date;
    liquidacion: { id: number; periodo: string; estado: string };
  }>;
};

export type ExpensaCobranzaSnapshot = {
  expensaId: number;
  estado: string;
  capitalOriginal: number;
  capitalPendiente: number;
  interesPendiente: number;
  interesGeneradoEnFecha: number;
  totalAdeudado: number;
  totalPagado: number;
  totalPagadoCapital: number;
  totalPagadoInteres: number;
  /** Capital e interés que pasaron a cobrarse en liquidaciones posteriores. */
  capitalTrasladado: number;
  interesTrasladado: number;
  trasladadaA: Array<{ liquidacionId: number; periodo: string }>;
  fechaCalculo: Date;
  fechaVencimientoBase: Date;
  consorcio: { id: number; nombre: string };
  liquidacion: { id: number; periodo: string };
  unidad: { id: number; identificador: string; tipo: string; porcentajeExpensas: number | null };
  pagos: ExpensaWithCobranzaData["pagos"];
};

export type EstimacionPagoExpensa = {
  monto: number;
  montoInteres: number;
  montoCapital: number;
  capitalPendienteResultante: number;
  saldoResultante: number;
  estadoResultante: string;
};

export class CobranzaError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "CobranzaError";
    this.code = code;
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function resolveEstadoResultante(totalPagado: number, saldoResultante: number) {
  if (saldoResultante <= EPSILON) {
    return FINAL_ESTADO;
  }

  if (totalPagado > EPSILON) {
    return "PARCIAL";
  }

  return "PENDIENTE";
}

async function getTasasHistoricas(db: DbClient, consorcioId: number): Promise<LiquidacionTasa[]> {
  const timeline = await db.liquidacion.findMany({
    where: {
      consorcioId,
      fechaVencimiento: { not: null },
      tasaInteresMensual: { not: null },
    },
    orderBy: [{ fechaVencimiento: "asc" }, { id: "asc" }],
    select: {
      fechaVencimiento: true,
      tasaInteresMensual: true,
    },
  });

  return timeline.map((row) => ({
    fechaVencimiento: row.fechaVencimiento!,
    tasaInteresMensual: row.tasaInteresMensual,
  }));
}

async function getExpensaWithCobranzaData(db: DbClient, expensaId: number): Promise<ExpensaWithCobranzaData | null> {
  return db.expensa.findUnique({
    where: { id: expensaId },
    include: {
      liquidacion: {
        select: {
          id: true,
          periodo: true,
          fechaEmision: true,
          fechaVencimiento: true,
          consorcioId: true,
          consorcio: { select: { id: true, nombre: true } },
        },
      },
      unidad: {
        select: {
          id: true,
          identificador: true,
          tipo: true,
          porcentajeExpensas: true,
        },
      },
      pagos: {
        orderBy: [{ fechaPago: "asc" }, { id: "asc" }],
        select: {
          id: true,
          fechaPago: true,
          monto: true,
          interesDevengado: true,
          montoCapital: true,
          montoInteres: true,
          saldoResultante: true,
          medioPago: true,
          referencia: true,
          nota: true,
          createdAt: true,
          comprobanteNombreOriginal: true,
          comprobanteMimeType: true,
          registradoPorUserId: true,
          registradoPorUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      },
      deudasIncluidas: {
        where: { liquidacion: { estado: { in: ESTADOS_LIQUIDACION_CON_TRASLADO } } },
        orderBy: [{ fechaCalculoInteres: "asc" }, { id: "asc" }],
        select: {
          criterio: true,
          capitalOriginal: true,
          interesCalculado: true,
          importeLiquidado: true,
          fechaCalculoInteres: true,
          liquidacion: { select: { id: true, periodo: true, estado: true } },
        },
      },
    },
  });
}

function calcularInteresIncremental(params: {
  capitalPendiente: number;
  fechaDesde: Date;
  fechaHasta: Date;
  tasasHistoricas: LiquidacionTasa[];
}) {
  const { capitalPendiente, fechaDesde, fechaHasta, tasasHistoricas } = params;

  if (capitalPendiente <= EPSILON || fechaHasta <= fechaDesde) {
    return 0;
  }

  return roundMoney(
    calcularInteresCapitalizadoPorTasas({
      capital: capitalPendiente,
      fechaVencimientoDeuda: fechaDesde,
      fechaCalculo: fechaHasta,
      tasasHistoricas,
    }).interes,
  );
}

export async function getExpensaCobranzaSnapshot(
  expensaId: number,
  fechaCalculo: Date,
  db: DbClient = prisma,
): Promise<ExpensaCobranzaSnapshot | null> {
  const expensa = await getExpensaWithCobranzaData(db, expensaId);
  if (!expensa) {
    return null;
  }

  const tasasHistoricas = await getTasasHistoricas(db, expensa.liquidacion.consorcioId);
  const fechaVencimientoBase = expensa.liquidacion.fechaVencimiento ?? expensa.liquidacion.fechaEmision;

  let capitalPendiente = roundMoney(expensa.monto);
  let interesPendiente = 0;
  let totalPagado = 0;
  let totalPagadoCapital = 0;
  let totalPagadoInteres = 0;
  let fechaBaseInteres = fechaVencimientoBase;
  let totalCapitalTrasladado = 0;
  let totalInteresTrasladado = 0;

  // Pagos y traslados a liquidaciones posteriores, en orden cronológico. Un
  // traslado funciona como una cancelación: esa deuda pasa a cobrarse en la
  // expensa de la liquidación que la incluyó.
  type Evento =
    | { tipo: "PAGO"; fecha: Date; pago: ExpensaWithCobranzaData["pagos"][number] }
    | { tipo: "TRASLADO"; fecha: Date; deuda: ExpensaWithCobranzaData["deudasIncluidas"][number] };
  const eventos: Evento[] = [
    ...expensa.pagos.map((pago) => ({ tipo: "PAGO" as const, fecha: pago.fechaPago, pago })),
    ...expensa.deudasIncluidas.map((deuda) => ({ tipo: "TRASLADO" as const, fecha: deuda.fechaCalculoInteres, deuda })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  for (const evento of eventos) {
    if (evento.fecha > fechaCalculo) {
      break;
    }

    interesPendiente = roundMoney(
      interesPendiente +
        calcularInteresIncremental({
          capitalPendiente,
          fechaDesde: fechaBaseInteres,
          fechaHasta: evento.fecha,
          tasasHistoricas,
        }),
    );

    if (evento.tipo === "TRASLADO") {
      const capital = Math.min(capitalPendiente, capitalTrasladado(evento.deuda));
      const interes = Math.min(interesPendiente, interesTrasladado(evento.deuda));
      capitalPendiente = roundMoney(capitalPendiente - capital);
      interesPendiente = roundMoney(interesPendiente - interes);
      totalCapitalTrasladado = roundMoney(totalCapitalTrasladado + capital);
      totalInteresTrasladado = roundMoney(totalInteresTrasladado + interes);
      fechaBaseInteres = evento.fecha;
      continue;
    }

    const pago = evento.pago;

    const montoInteres = roundMoney(Math.max(0, pago.montoInteres ?? 0));
    const inferredCapital = pago.montoCapital ?? Math.min(pago.monto, capitalPendiente);
    const montoCapital = roundMoney(Math.max(0, inferredCapital));

    interesPendiente = roundMoney(Math.max(0, interesPendiente - montoInteres));
    capitalPendiente = roundMoney(Math.max(0, capitalPendiente - montoCapital));

    totalPagado = roundMoney(totalPagado + pago.monto);
    totalPagadoCapital = roundMoney(totalPagadoCapital + montoCapital);
    totalPagadoInteres = roundMoney(totalPagadoInteres + montoInteres);
    fechaBaseInteres = pago.fechaPago;
  }

  const interesGeneradoEnFecha = calcularInteresIncremental({
    capitalPendiente,
    fechaDesde: fechaBaseInteres,
    fechaHasta: fechaCalculo,
    tasasHistoricas,
  });

  interesPendiente = roundMoney(interesPendiente + interesGeneradoEnFecha);
  const totalAdeudado = roundMoney(capitalPendiente + interesPendiente);

  const trasladada = totalCapitalTrasladado + totalInteresTrasladado > EPSILON;

  return {
    expensaId: expensa.id,
    estado:
      trasladada && totalAdeudado <= EPSILON
        ? ESTADO_EXPENSA_TRASLADADA
        : resolveEstadoResultante(totalPagado, totalAdeudado),
    capitalOriginal: roundMoney(expensa.monto),
    capitalPendiente,
    interesPendiente,
    interesGeneradoEnFecha,
    totalAdeudado,
    totalPagado,
    totalPagadoCapital,
    totalPagadoInteres,
    capitalTrasladado: totalCapitalTrasladado,
    interesTrasladado: totalInteresTrasladado,
    trasladadaA: expensa.deudasIncluidas.map((d) => ({ liquidacionId: d.liquidacion.id, periodo: d.liquidacion.periodo })),
    fechaCalculo,
    fechaVencimientoBase,
    consorcio: expensa.liquidacion.consorcio,
    liquidacion: {
      id: expensa.liquidacion.id,
      periodo: expensa.liquidacion.periodo,
    },
    unidad: expensa.unidad,
    pagos: expensa.pagos,
  };
}

export function estimatePagoExpensa(snapshot: ExpensaCobranzaSnapshot, monto: number): EstimacionPagoExpensa {
  const normalizedMonto = roundMoney(monto);

  if (normalizedMonto <= 0) {
    throw new CobranzaError("monto_invalido");
  }

  if (snapshot.estado === ESTADO_EXPENSA_TRASLADADA) {
    throw new CobranzaError("expensa_trasladada");
  }

  if (snapshot.totalAdeudado <= EPSILON) {
    throw new CobranzaError("expensa_pagada");
  }

  if (normalizedMonto - snapshot.totalAdeudado > EPSILON) {
    throw new CobranzaError("monto_excede_total_adeudado");
  }

  const montoInteres = roundMoney(Math.min(normalizedMonto, snapshot.interesPendiente));
  const montoCapital = roundMoney(Math.min(normalizedMonto - montoInteres, snapshot.capitalPendiente));
  const capitalPendienteResultante = roundMoney(Math.max(0, snapshot.capitalPendiente - montoCapital));
  const saldoResultante = roundMoney(Math.max(0, snapshot.totalAdeudado - normalizedMonto));
  const estadoResultante = resolveEstadoResultante(snapshot.totalPagado + normalizedMonto, saldoResultante);

  return {
    monto: normalizedMonto,
    montoInteres,
    montoCapital,
    capitalPendienteResultante,
    saldoResultante,
    estadoResultante,
  };
}

export async function registrarPagoExpensa(params: {
  expensaId: number;
  fechaPago: Date;
  monto: number;
  medioPago: string;
  consorcioCuentaBancariaId?: number | null;
  referencia?: string | null;
  nota?: string | null;
  registradoPorUserId: string;
  comprobante?: {
    comprobanteNombreOriginal: string;
    comprobanteMimeType: string;
    comprobanteContenido: Buffer;
    comprobanteSubidoAt: Date;
  } | null;
}) {
  return prisma.$transaction(async (tx) => {
    const snapshot = await getExpensaCobranzaSnapshot(params.expensaId, params.fechaPago, tx);

    if (!snapshot) {
      throw new CobranzaError("expensa_inexistente");
    }

    const hasFuturePayments = snapshot.pagos.some((pago) => pago.fechaPago > params.fechaPago);
    if (hasFuturePayments) {
      throw new CobranzaError("fecha_anterior_a_pago_existente");
    }

    if (!isMedioPagoExpensa(params.medioPago)) {
      throw new CobranzaError("medio_pago_invalido");
    }

    const medioPago: MedioPagoExpensa = params.medioPago;
    const cuentasActivas = medioPago === "TRANSFERENCIA"
      ? await tx.consorcioCuentaBancaria.findMany({
          where: {
            consorcioId: snapshot.consorcio.id,
            activa: true,
          },
          orderBy: [{ esCuentaExpensas: "desc" }, { banco: "asc" }, { id: "asc" }],
          select: {
            id: true,
            saldoActual: true,
            banco: true,
            tipoCuenta: true,
            numeroCuenta: true,
            alias: true,
          },
        })
      : [];

    let cuentaDestino: (typeof cuentasActivas)[number] | null = null;

    if (medioPago === "TRANSFERENCIA") {
      if (cuentasActivas.length === 0) {
        throw new CobranzaError("transferencia_sin_cuentas_activas");
      }

      if (cuentasActivas.length === 1) {
        cuentaDestino = cuentasActivas[0];
      } else {
        const cuentaSeleccionada = params.consorcioCuentaBancariaId
          ? cuentasActivas.find((cuenta) => cuenta.id === params.consorcioCuentaBancariaId)
          : null;

        if (!cuentaSeleccionada) {
          throw new CobranzaError("cuenta_bancaria_requerida");
        }

        cuentaDestino = cuentaSeleccionada;
      }
    }

    const estimacion = estimatePagoExpensa(snapshot, params.monto);

    const pago = await tx.pago.create({
      data: {
        expensaId: params.expensaId,
        consorcioCuentaBancariaId: cuentaDestino?.id ?? null,
        fechaPago: params.fechaPago,
        monto: estimacion.monto,
        capitalPendientePrevio: snapshot.capitalPendiente,
        interesDevengado: snapshot.interesPendiente,
        totalAdeudadoPrevio: snapshot.totalAdeudado,
        montoCapital: estimacion.montoCapital,
        montoInteres: estimacion.montoInteres,
        saldoResultante: estimacion.saldoResultante,
        medioPago: params.medioPago,
        referencia: params.referencia ?? null,
        nota: params.nota ?? null,
        registradoPorUserId: params.registradoPorUserId,
        comprobanteNombreOriginal: params.comprobante?.comprobanteNombreOriginal ?? null,
        comprobanteMimeType: params.comprobante?.comprobanteMimeType ?? null,
        comprobanteContenido: params.comprobante?.comprobanteContenido ?? null,
        comprobanteSubidoAt: params.comprobante?.comprobanteSubidoAt ?? null,
      },
    });

    if (medioPago === "EFECTIVO") {
      const consorcio = await tx.consorcio.findUnique({
        where: { id: snapshot.consorcio.id },
        select: { saldoCajaActual: true },
      });

      if (!consorcio) {
        throw new CobranzaError("consorcio_inexistente");
      }

      const saldoAnterior = roundMoney(consorcio.saldoCajaActual);
      const saldoPosterior = roundMoney(saldoAnterior + estimacion.monto);

      await tx.consorcio.update({
        where: { id: snapshot.consorcio.id },
        data: {
          saldoCajaActual: saldoPosterior,
        },
      });

      await tx.movimientoFondo.create({
        data: {
          consorcioId: snapshot.consorcio.id,
          pagoId: pago.id,
          fechaMovimiento: params.fechaPago,
          tipoOrigen: "PAGO_EXPENSA",
          tipoDestino: "CAJA",
          naturaleza: "INCREMENTO",
          descripcion: `Cobranza expensa ${snapshot.liquidacion.periodo} - unidad ${snapshot.unidad.identificador}`,
          monto: estimacion.monto,
          saldoAnterior,
          saldoPosterior,
        },
      });
    } else if (cuentaDestino) {
      const saldoAnterior = roundMoney(cuentaDestino.saldoActual);
      const saldoPosterior = roundMoney(saldoAnterior + estimacion.monto);

      await tx.consorcioCuentaBancaria.update({
        where: { id: cuentaDestino.id },
        data: {
          saldoActual: saldoPosterior,
        },
      });

      await tx.movimientoFondo.create({
        data: {
          consorcioId: snapshot.consorcio.id,
          pagoId: pago.id,
          consorcioCuentaBancariaId: cuentaDestino.id,
          fechaMovimiento: params.fechaPago,
          tipoOrigen: "PAGO_EXPENSA",
          tipoDestino: "CUENTA_BANCARIA",
          naturaleza: "INCREMENTO",
          descripcion: `Cobranza expensa ${snapshot.liquidacion.periodo} - unidad ${snapshot.unidad.identificador}`,
          monto: estimacion.monto,
          saldoAnterior,
          saldoPosterior,
        },
      });
    }

    await tx.expensa.update({
      where: { id: params.expensaId },
      data: {
        saldo: estimacion.capitalPendienteResultante,
        estado: estimacion.estadoResultante,
      },
    });

    return {
      pagoId: pago.id,
      snapshot,
      estimacion,
    };
  });
}

export function formatUserLabel(user: { email: string | null; name: string | null } | null) {
  if (!user) {
    return "-";
  }

  return user.name?.trim() || user.email?.trim() || "-";
}
