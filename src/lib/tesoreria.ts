import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export const TESORERIA_AJUSTE_TIPOS = ["INCREMENTO", "DISMINUCION"] as const;
export type TesoreriaAjusteTipo = (typeof TESORERIA_AJUSTE_TIPOS)[number];

export const TESORERIA_DESTINOS = ["CAJA", "CUENTA_BANCARIA"] as const;
export type TesoreriaDestinoTipo = (typeof TESORERIA_DESTINOS)[number];

export class TesoreriaError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "TesoreriaError";
    this.code = code;
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertMontoPositivo(monto: number) {
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new TesoreriaError("monto_invalido");
  }
}

function assertDescripcion(descripcion: string | null | undefined) {
  if (!descripcion?.trim()) {
    throw new TesoreriaError("descripcion_requerida");
  }
}

function assertAjusteTipo(tipo: string): TesoreriaAjusteTipo {
  if (tipo !== "INCREMENTO" && tipo !== "DISMINUCION") {
    throw new TesoreriaError("tipo_ajuste_invalido");
  }

  return tipo;
}

function resolveSaldoPosterior(params: {
  saldoActual: number;
  tipo: TesoreriaAjusteTipo;
  monto: number;
}) {
  const saldoActual = roundMoney(params.saldoActual);
  const monto = roundMoney(params.monto);
  const saldoPosterior = params.tipo === "INCREMENTO"
    ? roundMoney(saldoActual + monto)
    : roundMoney(saldoActual - monto);

  if (saldoPosterior < 0) {
    throw new TesoreriaError("saldo_insuficiente");
  }

  return {
    saldoAnterior: saldoActual,
    saldoPosterior,
  };
}

export async function ajustarCajaConsorcio(params: {
  consorcioId: number;
  tipo: string;
  monto: number;
  descripcion: string;
}) {
  assertMontoPositivo(params.monto);
  assertDescripcion(params.descripcion);
  const tipo = assertAjusteTipo(params.tipo);

  return prisma.$transaction(async (tx) => {
    const consorcio = await tx.consorcio.findUnique({
      where: { id: params.consorcioId },
      select: { id: true, saldoCajaActual: true },
    });

    if (!consorcio) {
      throw new TesoreriaError("consorcio_inexistente");
    }

    const { saldoAnterior, saldoPosterior } = resolveSaldoPosterior({
      saldoActual: consorcio.saldoCajaActual,
      tipo,
      monto: params.monto,
    });

    await tx.consorcio.update({
      where: { id: consorcio.id },
      data: { saldoCajaActual: saldoPosterior },
    });

    return tx.movimientoFondo.create({
      data: {
        consorcioId: consorcio.id,
        fechaMovimiento: new Date(),
        tipoOrigen: "AJUSTE_MANUAL",
        tipoDestino: "CAJA",
        naturaleza: tipo,
        descripcion: params.descripcion.trim(),
        monto: roundMoney(params.monto),
        saldoAnterior,
        saldoPosterior,
      },
    });
  });
}

export async function ajustarCuentaBancariaConsorcio(params: {
  consorcioId: number;
  cuentaBancariaId: number;
  tipo: string;
  monto: number;
  descripcion: string;
}) {
  assertMontoPositivo(params.monto);
  assertDescripcion(params.descripcion);
  const tipo = assertAjusteTipo(params.tipo);

  return prisma.$transaction(async (tx) => {
    const cuenta = await tx.consorcioCuentaBancaria.findFirst({
      where: {
        id: params.cuentaBancariaId,
        consorcioId: params.consorcioId,
      },
      select: {
        id: true,
        consorcioId: true,
        saldoActual: true,
      },
    });

    if (!cuenta) {
      throw new TesoreriaError("cuenta_inexistente");
    }

    const { saldoAnterior, saldoPosterior } = resolveSaldoPosterior({
      saldoActual: cuenta.saldoActual,
      tipo,
      monto: params.monto,
    });

    await tx.consorcioCuentaBancaria.update({
      where: { id: cuenta.id },
      data: { saldoActual: saldoPosterior },
    });

    return tx.movimientoFondo.create({
      data: {
        consorcioId: cuenta.consorcioId,
        consorcioCuentaBancariaId: cuenta.id,
        fechaMovimiento: new Date(),
        tipoOrigen: "AJUSTE_MANUAL",
        tipoDestino: "CUENTA_BANCARIA",
        naturaleza: tipo,
        descripcion: params.descripcion.trim(),
        monto: roundMoney(params.monto),
        saldoAnterior,
        saldoPosterior,
      },
    });
  });
}

export async function cambiarEstadoCuentaBancaria(params: {
  consorcioId: number;
  cuentaBancariaId: number;
  activa: boolean;
  db?: DbClient;
}) {
  const db = params.db ?? prisma;

  const cuenta = await db.consorcioCuentaBancaria.findFirst({
    where: {
      id: params.cuentaBancariaId,
      consorcioId: params.consorcioId,
    },
    select: {
      id: true,
      activa: true,
      esCuentaExpensas: true,
    },
  });

  if (!cuenta) {
    throw new TesoreriaError("cuenta_inexistente");
  }

  if (!params.activa && cuenta.esCuentaExpensas) {
    throw new TesoreriaError("cuenta_expensas_no_desactivable");
  }

  return db.consorcioCuentaBancaria.update({
    where: { id: cuenta.id },
    data: { activa: params.activa },
  });
}
