import { Prisma } from "@prisma/client";

import { ejercicioCerradoPorFecha } from "./ejercicio-bloqueo";
import { type CuentaBancariaDestino, formatCuentaBancariaDestino, isMedioPagoExpensa, type MedioPagoExpensa } from "./fondos";
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

    const cerrado = await ejercicioCerradoPorFecha(snapshot.consorcioId, params.fechaPago, tx);
    if (cerrado) {
      throw new PagoGastoError("ejercicio_cerrado", `Ejercicio N.º ${cerrado.numero} cerrado`);
    }

    const hasFuturePayments = snapshot.pagosGasto.some((pago) => pago.fechaPago > params.fechaPago);
    if (hasFuturePayments) {
      throw new PagoGastoError("fecha_anterior_a_pago_existente");
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

// ------------------------------------------------------------ Edición de pagos

type DestinoFondo = { tipo: "CAJA" } | { tipo: "CUENTA_BANCARIA"; cuentaId: number };

function mismoDestino(a: DestinoFondo, b: DestinoFondo) {
  if (a.tipo === "CAJA" || b.tipo === "CAJA") return a.tipo === b.tipo;
  return a.cuentaId === b.cuentaId;
}

/**
 * Suma `delta` a los saldos anterior/posterior de los movimientos cargados
 * después de `desdeId` en el mismo destino, y al saldo actual del destino.
 * La cadena de saldos de Tesorería sigue el orden de carga (id), no la fecha.
 */
async function desplazarSaldos(
  tx: Prisma.TransactionClient,
  consorcioId: number,
  destino: DestinoFondo,
  desdeId: number,
  delta: number,
) {
  if (Math.abs(delta) < EPSILON) return;

  if (destino.tipo === "CAJA") {
    await tx.$executeRaw`
      UPDATE "MovimientoFondo"
      SET "saldoAnterior" = ROUND(("saldoAnterior" + ${delta})::numeric, 2)::float8,
          "saldoPosterior" = ROUND(("saldoPosterior" + ${delta})::numeric, 2)::float8
      WHERE "consorcioId" = ${consorcioId} AND "tipoDestino" = 'CAJA' AND id > ${desdeId}`;
    await tx.$executeRaw`
      UPDATE "Consorcio" SET "saldoCajaActual" = ROUND(("saldoCajaActual" + ${delta})::numeric, 2)::float8
      WHERE id = ${consorcioId}`;
  } else {
    await tx.$executeRaw`
      UPDATE "MovimientoFondo"
      SET "saldoAnterior" = ROUND(("saldoAnterior" + ${delta})::numeric, 2)::float8,
          "saldoPosterior" = ROUND(("saldoPosterior" + ${delta})::numeric, 2)::float8
      WHERE "consorcioId" = ${consorcioId} AND "tipoDestino" = 'CUENTA_BANCARIA'
        AND "consorcioCuentaBancariaId" = ${destino.cuentaId} AND id > ${desdeId}`;
    await tx.$executeRaw`
      UPDATE "ConsorcioCuentaBancaria" SET "saldoActual" = ROUND(("saldoActual" + ${delta})::numeric, 2)::float8
      WHERE id = ${destino.cuentaId}`;
  }
}

/** Ningún saldo del destino puede quedar negativo después de la edición. */
async function verificarSaldosNoNegativos(tx: Prisma.TransactionClient, consorcioId: number, destino: DestinoFondo) {
  const movimientoNegativo = await tx.movimientoFondo.findFirst({
    where: {
      consorcioId,
      tipoDestino: destino.tipo,
      ...(destino.tipo === "CUENTA_BANCARIA" ? { consorcioCuentaBancariaId: destino.cuentaId } : {}),
      saldoPosterior: { lt: -0.005 },
    },
    select: { id: true },
  });

  const saldoActual =
    destino.tipo === "CAJA"
      ? ((
          await tx.consorcio.findUnique({
            where: { id: consorcioId },
            select: { saldoCajaActual: true },
          })
        )?.saldoCajaActual ?? 0)
      : ((
          await tx.consorcioCuentaBancaria.findUnique({
            where: { id: destino.cuentaId },
            select: { saldoActual: true },
          })
        )?.saldoActual ?? 0);

  if (movimientoNegativo || saldoActual < -0.005) {
    throw new PagoGastoError("saldo_insuficiente");
  }
}

/**
 * Edita fecha, importe, medio/cuenta y observación de un pago de gasto, y
 * corrige Tesorería:
 * - mismo destino: se actualiza el movimiento y se desplazan los saldos de los
 *   movimientos cargados después (por la diferencia de importe);
 * - otro destino: se revierte el movimiento en el destino anterior y se carga
 *   uno nuevo al final de la cadena del destino nuevo.
 * Un cambio solo de fecha no altera saldos. No se permite si la fecha anterior
 * o la nueva caen en un ejercicio cerrado.
 */
export async function editarPagoGasto(params: {
  pagoGastoId: number;
  consorcioId: number;
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
  return prisma.$transaction((tx) => editarPagoGastoEnTransaccion(tx, params, medioPago, monto), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

/** Cuerpo de `editarPagoGasto`; exportado para probarlo dentro de una transacción que se revierte. */
export async function editarPagoGastoEnTransaccion(
  tx: Prisma.TransactionClient,
  params: Parameters<typeof editarPagoGasto>[0],
  medioPago: MedioPagoExpensa,
  monto: number,
) {
  const observacion = params.observacion?.trim() || null;
  const pago = await tx.pagoGasto.findUnique({
    where: { id: params.pagoGastoId },
    include: {
      movimientoFondo: true,
      gasto: {
        select: { id: true, concepto: true, periodo: true, monto: true },
      },
    },
  });

  if (!pago || pago.consorcioId !== params.consorcioId) {
    throw new PagoGastoError("pago_inexistente");
  }

  for (const fecha of [pago.fechaPago, params.fechaPago]) {
    const cerrado = await ejercicioCerradoPorFecha(pago.consorcioId, fecha, tx);
    if (cerrado) {
      throw new PagoGastoError("ejercicio_cerrado", `Ejercicio N.º ${cerrado.numero} cerrado`);
    }
  }

  const otrosPagos = await tx.pagoGasto.aggregate({
    where: { gastoId: pago.gastoId, id: { not: pago.id } },
    _sum: { monto: true },
  });
  if (roundMoney((otrosPagos._sum.monto ?? 0) + monto) - pago.gasto.monto > EPSILON) {
    throw new PagoGastoError("monto_excede_saldo_pendiente");
  }

  // Destino nuevo. La cuenta actual del pago se acepta aunque esté inactiva.
  let destinoNuevo: DestinoFondo = { tipo: "CAJA" };
  let cuentaNueva: CuentaBancariaDestino | null = null;
  if (medioPago === "TRANSFERENCIA") {
    const cuentaId = params.consorcioCuentaBancariaId ?? null;
    if (!cuentaId) {
      throw new PagoGastoError("cuenta_bancaria_requerida");
    }
    cuentaNueva = await tx.consorcioCuentaBancaria.findFirst({
      where: {
        id: cuentaId,
        consorcioId: pago.consorcioId,
        ...(cuentaId === pago.consorcioCuentaBancariaId ? {} : { activa: true }),
      },
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
    });
    if (!cuentaNueva) {
      throw new PagoGastoError("cuenta_bancaria_requerida");
    }
    destinoNuevo = { tipo: "CUENTA_BANCARIA", cuentaId: cuentaNueva.id };
  }

  const descripcion =
    observacion ||
    `Pago de gasto ${pago.gasto.concepto} (${pago.gasto.periodo})${cuentaNueva ? ` desde ${formatCuentaBancariaDestino(cuentaNueva)}` : ""}`;

  const actualizado = await tx.pagoGasto.update({
    where: { id: pago.id },
    data: {
      fechaPago: params.fechaPago,
      monto,
      medioPago,
      consorcioCuentaBancariaId: cuentaNueva?.id ?? null,
      observacion,
    },
  });

  const mov = pago.movimientoFondo;
  if (!mov) {
    // Pago sin movimiento de Tesorería (carga previa): no se generan saldos nuevos.
    return actualizado;
  }

  const destinoAnterior: DestinoFondo =
    mov.tipoDestino === "CAJA" || mov.consorcioCuentaBancariaId === null
      ? { tipo: "CAJA" }
      : {
          tipo: "CUENTA_BANCARIA",
          cuentaId: mov.consorcioCuentaBancariaId,
        };

  if (mismoDestino(destinoAnterior, destinoNuevo)) {
    // El pago resta: más importe baja los saldos posteriores.
    const delta = roundMoney(mov.monto - monto);
    await tx.movimientoFondo.update({
      where: { id: mov.id },
      data: {
        fechaMovimiento: params.fechaPago,
        monto,
        descripcion,
        saldoPosterior: roundMoney(mov.saldoAnterior - monto),
      },
    });
    await desplazarSaldos(tx, pago.consorcioId, destinoAnterior, mov.id, delta);
    await verificarSaldosNoNegativos(tx, pago.consorcioId, destinoAnterior);
    return actualizado;
  }

  // Cambio de caja/cuenta: revertir en el destino anterior y cargar en el nuevo.
  await tx.movimientoFondo.delete({ where: { id: mov.id } });
  await desplazarSaldos(tx, pago.consorcioId, destinoAnterior, mov.id, mov.monto);

  const saldoAnterior = roundMoney(
    destinoNuevo.tipo === "CAJA"
      ? (
          await tx.consorcio.findUniqueOrThrow({
            where: { id: pago.consorcioId },
            select: { saldoCajaActual: true },
          })
        ).saldoCajaActual
      : (
          await tx.consorcioCuentaBancaria.findUniqueOrThrow({
            where: { id: destinoNuevo.cuentaId },
            select: { saldoActual: true },
          })
        ).saldoActual,
  );
  const saldoPosterior = roundMoney(saldoAnterior - monto);
  if (saldoPosterior < 0) {
    throw new PagoGastoError("saldo_insuficiente");
  }
  if (destinoNuevo.tipo === "CAJA") {
    await tx.consorcio.update({
      where: { id: pago.consorcioId },
      data: { saldoCajaActual: saldoPosterior },
    });
  } else {
    await tx.consorcioCuentaBancaria.update({
      where: { id: destinoNuevo.cuentaId },
      data: { saldoActual: saldoPosterior },
    });
  }
  await tx.movimientoFondo.create({
    data: {
      consorcioId: pago.consorcioId,
      pagoGastoId: pago.id,
      consorcioCuentaBancariaId: cuentaNueva?.id ?? null,
      fechaMovimiento: params.fechaPago,
      tipoOrigen: "PAGO_GASTO",
      tipoDestino: destinoNuevo.tipo,
      naturaleza: "DISMINUCION",
      descripcion,
      monto,
      saldoAnterior,
      saldoPosterior,
    },
  });
  await verificarSaldosNoNegativos(tx, pago.consorcioId, destinoAnterior);
  return actualizado;
}
