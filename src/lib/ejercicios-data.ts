import { Prisma } from "@prisma/client";

import {
  ESTADOS_APERTURA,
  type EstadoApertura,
  calcularVencimientoRendicion,
  sumarDias,
  validarEjercicio,
} from "./ejercicios";
import { aperturaDesdeEjercicioAnterior } from "./cierre-confirmacion";
import { prisma } from "./prisma";

// Acceso a datos de ejercicios. Las validaciones de superposición y contigüidad
// se hacen dentro de una transacción serializable para que dos altas
// simultáneas no puedan dejar ejercicios superpuestos.

export type ResultadoEscrituraEjercicio =
  | { ok: true; id: number; advertencias: string[] }
  | { ok: false; errores: string[] };

type DatosEjercicio = {
  fechaInicio: Date;
  fechaFin: Date;
  vencimientoRendicion: Date | null;
  fundamento: string | null;
  observaciones: string | null;
};

const SELECT_PERIODO = { id: true, numero: true, fechaInicio: true, fechaFin: true, estado: true } as const;

function erroresBloqueantes(datos: DatosEjercicio, resultado: { errores: string[]; advertencias: string[] }) {
  const errores = [...resultado.errores];
  // Un período irregular sin fundamento no se guarda: el respaldo es lo que lo justifica.
  if (resultado.advertencias.length > 0 && !datos.fundamento) {
    errores.push("El período no dura un año: indicá el fundamento (reglamento, acta o decisión) que lo fija.");
  }
  return errores;
}

async function enTransaccion<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listarEjercicios(consorcioId: number) {
  return prisma.ejercicio.findMany({
    where: { consorcioId },
    orderBy: { fechaInicio: "desc" },
  });
}

export async function crearEjercicio(
  consorcioId: number,
  datos: DatosEjercicio,
  userId: string,
): Promise<ResultadoEscrituraEjercicio> {
  return enTransaccion(async (tx) => {
    const existentes = await tx.ejercicio.findMany({ where: { consorcioId }, select: SELECT_PERIODO });
    const ultimo = existentes.reduce<(typeof existentes)[number] | null>(
      (acc, e) => (!acc || e.fechaFin > acc.fechaFin ? e : acc),
      null,
    );

    if (ultimo && datos.fechaInicio.getTime() !== sumarDias(ultimo.fechaFin, 1).getTime()) {
      return {
        ok: false as const,
        errores: ["Un ejercicio nuevo debe empezar el día siguiente al cierre del último ejercicio registrado."],
      };
    }

    const resultado = validarEjercicio(datos, existentes);
    const errores = erroresBloqueantes(datos, resultado);
    if (errores.length > 0) return { ok: false as const, errores };

    const numero = existentes.reduce((max, e) => Math.max(max, e.numero), 0) + 1;
    // Si el anterior ya está cerrado, la apertura sale de su cierre confirmado.
    const apertura = ultimo ? await aperturaDesdeEjercicioAnterior(tx, ultimo.id) : null;
    const creado = await tx.ejercicio.create({
      data: {
        consorcioId,
        numero,
        ...(apertura && ultimo
          ? {
              aperturaEstado: "INFORMADA",
              aperturaDetalle: apertura as unknown as Prisma.InputJsonValue,
              aperturaConfirmadaAt: new Date(),
              aperturaConfirmadaPorUserId: userId,
              aperturaObservaciones: `Saldos al cierre del ejercicio N.º ${ultimo.numero} (versión ${apertura.origen?.version ?? 1}).`,
            }
          : {}),
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        vencimientoRendicion: datos.vencimientoRendicion ?? calcularVencimientoRendicion(datos.fechaFin),
        fundamento: datos.fundamento,
        observaciones: datos.observaciones,
        createdByUserId: userId,
      },
    });

    return { ok: true as const, id: creado.id, advertencias: resultado.advertencias };
  });
}

export async function actualizarEjercicio(
  consorcioId: number,
  ejercicioId: number,
  datos: DatosEjercicio,
): Promise<ResultadoEscrituraEjercicio> {
  return enTransaccion(async (tx) => {
    const existentes = await tx.ejercicio.findMany({ where: { consorcioId }, select: SELECT_PERIODO });
    const actual = existentes.find((e) => e.id === ejercicioId);
    if (!actual) return { ok: false as const, errores: ["El ejercicio no existe en el consorcio activo."] };

    const resultado = validarEjercicio({ ...datos, id: ejercicioId, numero: actual.numero }, existentes);
    const errores = erroresBloqueantes(datos, resultado);
    if (errores.length > 0) return { ok: false as const, errores };

    await tx.ejercicio.update({
      where: { id: ejercicioId },
      data: {
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        vencimientoRendicion: datos.vencimientoRendicion ?? calcularVencimientoRendicion(datos.fechaFin),
        fundamento: datos.fundamento,
        observaciones: datos.observaciones,
      },
    });

    return { ok: true as const, id: ejercicioId, advertencias: resultado.advertencias };
  });
}

export async function registrarApertura(
  consorcioId: number,
  ejercicioId: number,
  estado: EstadoApertura,
  observaciones: string | null,
  userId: string,
): Promise<ResultadoEscrituraEjercicio> {
  if (!ESTADOS_APERTURA.includes(estado)) {
    return { ok: false, errores: ["El estado de apertura no es válido."] };
  }

  const actual = await prisma.ejercicio.findFirst({ where: { id: ejercicioId, consorcioId } });
  if (!actual) return { ok: false, errores: ["El ejercicio no existe en el consorcio activo."] };
  if (actual.estado !== "ABIERTO") {
    return { ok: false, errores: ["El ejercicio está cerrado: la apertura no se puede modificar."] };
  }

  const confirmada = estado !== "PENDIENTE";
  await prisma.ejercicio.update({
    where: { id: ejercicioId },
    data: {
      aperturaEstado: estado,
      // El detalle por cuenta solo vale para una apertura informada (la que sale del cierre anterior).
      ...(estado === "INFORMADA" ? {} : { aperturaDetalle: Prisma.DbNull }),
      aperturaObservaciones: observaciones,
      aperturaConfirmadaAt: confirmada ? new Date() : null,
      aperturaConfirmadaPorUserId: confirmada ? userId : null,
    },
  });

  return { ok: true, id: ejercicioId, advertencias: [] };
}

/** Solo se puede eliminar el último ejercicio, y solo si está abierto. */
export async function eliminarEjercicio(consorcioId: number, ejercicioId: number): Promise<ResultadoEscrituraEjercicio> {
  return enTransaccion(async (tx) => {
    const existentes = await tx.ejercicio.findMany({ where: { consorcioId }, select: SELECT_PERIODO });
    const actual = existentes.find((e) => e.id === ejercicioId);
    if (!actual) return { ok: false as const, errores: ["El ejercicio no existe en el consorcio activo."] };
    if (actual.estado !== "ABIERTO") {
      return { ok: false as const, errores: ["Un ejercicio cerrado no se puede eliminar."] };
    }
    if (await tx.cierreEjercicio.count({ where: { ejercicioId } })) {
      return { ok: false as const, errores: ["El ejercicio tiene cierres registrados (aunque se haya reabierto): no se puede eliminar."] };
    }
    if (existentes.some((e) => e.fechaInicio > actual.fechaInicio)) {
      return { ok: false as const, errores: ["Solo se puede eliminar el último ejercicio registrado."] };
    }

    await tx.ejercicio.delete({ where: { id: ejercicioId } });
    return { ok: true as const, id: ejercicioId, advertencias: [] };
  });
}
