import { Prisma } from "@prisma/client";

import { formatCuentaBancariaDestino, isMedioPagoExpensa, type MedioPagoExpensa } from "./fondos";
import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

const EPSILON = 0.00001;

type GastoPagoSnapshot = {
  id: number;
  consorcioId: number;
  concepto: string;
  periodo: string;
  monto: number;
  pagosGasto: Array<{
    id: number;
    monto: number;
    fechaPago: Date;
  }>;
};

export type GastoPagoEstado = "PENDIENTE" | "PAGADO_PARCIAL" | "PAGADO_TOTAL";

export class PagoGastoError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "PagoGastoError";
    this.code = code;
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeTotalPagado(pagos: Array<{ monto: number }>) {
  return roundMoney(pagos.reduce((acc, pago) => acc + pago.monto, 0));
}

export function getGastoPagoEstado(params: {
  montoTotal: number;
  totalPagado: number;
}): GastoPagoEstado {
  const saldoPendiente = roundMoney(params.montoTotal - params.totalPagado);

  if (saldoPendiente <= EPSILON) {
    return "PAGADO_TOTAL";
  }

  if (params.totalPagado > EPSILON) {
    return "PAGADO_PARCIAL";
  }

  return "PENDIENTE";
}

export function buildGastoPagoSummary(params: {
  montoTotal: number;
  pagos: Array<{ monto: number }>;
}) {
  const totalPagado = computeTotalPagado(params.pagos);
  const saldoPendiente = roundMoney(Math.max(0, params.montoTotal - totalPagado));

  return {
    totalPagado,
    saldoPendiente,
    estado: getGastoPagoEstado({
      montoTotal: params.montoTotal,
      totalPagado,
    }),
  };
}

async function getGastoPagoSnapshot(db: DbClient, gastoId: number): Promise<GastoPagoSnapshot | null> {
  return db.gasto.findUnique({
    where: { id: gastoId },
    select: {
      id: true,
      consorcioId: true,
      concepto: true,
      periodo: true,
      monto: true,
      pagosGasto: {
        orderBy: [{ fechaPago: "asc" }, { id: "asc" }],
        select: {
          id: true,
          monto: true,
          fechaPago: true,
        },
      },
    },
  });
}

export async function registrarPagoGasto(params: {
  gastoId: number;
  fechaPago: Date;
  monto: number;
  medioPago: string;
  consorcioCuentaBancariaId?: number | null;
  observacion?: string | null;
}) {
  if (!isMedioPagoExpensa(params.medioPago)) {
    throw new PagoGastoError("medio_pago_invalido");
  }

  const medioPago: MedioPagoExpensa = params.medioPago;
  const monto = roundMoney(params.monto);

  if (!Number.isFinite(monto) || monto <= 0) {
    throw new PagoGastoError("monto_invalido");
  }

  return prisma.$transaction(async (tx) => {
    const snapshot = await getGastoPagoSnapshot(tx, params.gastoId);

    if (!snapshot) {
      throw new PagoGastoError("gasto_inexistente");
    }

    const { saldoPendiente } = buildGastoPagoSummary({
      montoTotal: snapshot.monto,
      pagos: snapshot.pagosGasto,
    });

    if (saldoPendiente <= EPSILON) {
      throw new PagoGastoError("gasto_pagado_total");
    }

    if (monto - saldoPendiente > EPSILON) {
      throw new PagoGastoError("monto_excede_saldo_pendiente");
    }

    const cuentasActivas = medioPago === "TRANSFERENCIA"
      ? await tx.consorcioCuentaBancaria.findMany({
          where: {
            consorcioId: snapshot.consorcioId,
            activa: true,
          },
          orderBy: [{ esCuentaExpensas: "desc" }, { banco: "asc" }, { id: "asc" }],
          select: {
            id: true,
            banco: true,
            tipoCuenta: true,
            titular: true,
            numeroCuenta: true,
            cbu: true,
            alias: true,
            saldoActual: true,
          },
        })
      : [];

    let cuentaDestino: (typeof cuentasActivas)[number] | null = null;

    if (medioPago === "TRANSFERENCIA") {
      if (cuentasActivas.length === 0) {
        throw new PagoGastoError("transferencia_sin_cuentas_activas");
      }

      if (cuentasActivas.length === 1) {
        cuentaDestino = cuentasActivas[0];
      } else {
        cuentaDestino = params.consorcioCuentaBancariaId
          ? cuentasActivas.find((cuenta) => cuenta.id === params.consorcioCuentaBancariaId) ?? null
          : null;

        if (!cuentaDestino) {
          throw new PagoGastoError("cuenta_bancaria_requerida");
        }
      }
    }

    const pagoGasto = await tx.pagoGasto.create({
      data: {
        gastoId: snapshot.id,
        consorcioId: snapshot.consorcioId,
        fechaPago: params.fechaPago,
        monto,
        medioPago,
        consorcioCuentaBancariaId: cuentaDestino?.id ?? null,
        observacion: params.observacion?.trim() || null,
      },
    });

    if (medioPago === "EFECTIVO") {
      const consorcio = await tx.consorcio.findUnique({
        where: { id: snapshot.consorcioId },
        select: { saldoCajaActual: true },
      });

      if (!consorcio) {
        throw new PagoGastoError("consorcio_inexistente");
      }

      const saldoAnterior = roundMoney(consorcio.saldoCajaActual);
      const saldoPosterior = roundMoney(saldoAnterior - monto);

      if (saldoPosterior < 0) {
        throw new PagoGastoError("saldo_insuficiente");
      }

      await tx.consorcio.update({
        where: { id: snapshot.consorcioId },
        data: { saldoCajaActual: saldoPosterior },
      });

      await tx.movimientoFondo.create({
        data: {
          consorcioId: snapshot.consorcioId,
          pagoGastoId: pagoGasto.id,
          fechaMovimiento: params.fechaPago,
          tipoOrigen: "PAGO_GASTO",
          tipoDestino: "CAJA",
          naturaleza: "DISMINUCION",
          descripcion: params.observacion?.trim() || `Pago de gasto ${snapshot.concepto} (${snapshot.periodo})`,
          monto,
          saldoAnterior,
          saldoPosterior,
        },
      });
    } else if (cuentaDestino) {
      const saldoAnterior = roundMoney(cuentaDestino.saldoActual);
      const saldoPosterior = roundMoney(saldoAnterior - monto);

      if (saldoPosterior < 0) {
        throw new PagoGastoError("saldo_insuficiente");
      }

      await tx.consorcioCuentaBancaria.update({
        where: { id: cuentaDestino.id },
        data: { saldoActual: saldoPosterior },
      });

      await tx.movimientoFondo.create({
        data: {
          consorcioId: snapshot.consorcioId,
          pagoGastoId: pagoGasto.id,
          consorcioCuentaBancariaId: cuentaDestino.id,
          fechaMovimiento: params.fechaPago,
          tipoOrigen: "PAGO_GASTO",
          tipoDestino: "CUENTA_BANCARIA",
          naturaleza: "DISMINUCION",
          descripcion:
            params.observacion?.trim() ||
            `Pago de gasto ${snapshot.concepto} (${snapshot.periodo}) desde ${formatCuentaBancariaDestino(cuentaDestino)}`,
          monto,
          saldoAnterior,
          saldoPosterior,
        },
      });
    }

    return pagoGasto;
  });
}
