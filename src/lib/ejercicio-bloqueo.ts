import { Prisma } from "@prisma/client";

import { normalizePeriodo } from "./periodo";
import { prisma } from "./prisma";

// Bloqueo de escrituras sobre ejercicios cerrados.
//
// Un registro pertenece a un ejercicio con el mismo criterio que la simulación
// del cierre (src/lib/cierre-simulacion.ts):
// - lo percibido (cobros, pagos, movimientos de fondos) por fecha efectiva;
// - lo devengado (gastos, liquidaciones) por período "AAAA-MM" entre el mes de
//   inicio y el mes de cierre del ejercicio.
// Cualquier estado distinto de ABIERTO bloquea (CERRADO y CERRANDO, mientras se
// generan los documentos de la confirmación). Para corregir algo hay que
// reabrir el ejercicio.

type DbClient = typeof prisma | Prisma.TransactionClient;

export const EJERCICIO_CERRADO_CODIGO = "ejercicio_cerrado";

export const EJERCICIO_CERRADO_MENSAJE =
  "Corresponde a un ejercicio cerrado: no se puede modificar. Para corregirlo, reabrí el ejercicio desde Administración → Ejercicios.";

export type EjercicioBloqueante = { id: number; numero: number };

export class EjercicioCerradoError extends Error {
  code = EJERCICIO_CERRADO_CODIGO;
  ejercicio: EjercicioBloqueante;

  constructor(ejercicio: EjercicioBloqueante) {
    super(`Ejercicio N.º ${ejercicio.numero} cerrado`);
    this.name = "EjercicioCerradoError";
    this.ejercicio = ejercicio;
  }
}

const NO_ABIERTO = { not: "ABIERTO" };

/** Medianoche UTC del día UTC de la fecha (las fechas operativas se guardan a 00:00Z o 03:00Z del día). */
function diaUTC(fecha: Date) {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

/** Ejercicio no abierto que contiene la fecha, o null. */
export async function ejercicioCerradoPorFecha(
  consorcioId: number,
  fecha: Date,
  db: DbClient = prisma,
): Promise<EjercicioBloqueante | null> {
  if (Number.isNaN(fecha.getTime())) return null;
  const dia = diaUTC(fecha);
  return db.ejercicio.findFirst({
    where: { consorcioId, estado: NO_ABIERTO, fechaInicio: { lte: dia }, fechaFin: { gte: dia } },
    select: { id: true, numero: true },
  });
}

/** Ejercicio no abierto que contiene el período "AAAA-MM" (o "AAAAMM"), o null. */
export async function ejercicioCerradoPorPeriodo(
  consorcioId: number,
  periodo: string | null | undefined,
  db: DbClient = prisma,
): Promise<EjercicioBloqueante | null> {
  const normalizado = periodo ? normalizePeriodo(periodo) : null;
  if (!normalizado) return null;
  const [anio, mes] = normalizado.split("-").map(Number);
  const primerDia = new Date(Date.UTC(anio, mes - 1, 1));
  const ultimoDia = new Date(Date.UTC(anio, mes, 0));
  // Mismo criterio que la simulación: mes(inicio) <= período <= mes(fin).
  return db.ejercicio.findFirst({
    where: { consorcioId, estado: NO_ABIERTO, fechaInicio: { lte: ultimoDia }, fechaFin: { gte: primerDia } },
    select: { id: true, numero: true },
  });
}

export async function assertFechaEditable(consorcioId: number, fecha: Date, db: DbClient = prisma) {
  const cerrado = await ejercicioCerradoPorFecha(consorcioId, fecha, db);
  if (cerrado) throw new EjercicioCerradoError(cerrado);
}

export async function assertPeriodoEditable(consorcioId: number, periodo: string | null | undefined, db: DbClient = prisma) {
  const cerrado = await ejercicioCerradoPorPeriodo(consorcioId, periodo, db);
  if (cerrado) throw new EjercicioCerradoError(cerrado);
}

/** True si alguno de los períodos cae en un ejercicio no abierto. */
export async function algunPeriodoCerrado(consorcioId: number, periodos: Array<string | null | undefined>) {
  for (const periodo of periodos) {
    if (await ejercicioCerradoPorPeriodo(consorcioId, periodo)) return true;
  }
  return false;
}

/** Liquidación cuyo período cae en un ejercicio no abierto. */
export async function liquidacionEnEjercicioCerrado(liquidacionId: number, db: DbClient = prisma) {
  const liquidacion = await db.liquidacion.findUnique({
    where: { id: liquidacionId },
    select: { consorcioId: true, periodo: true },
  });
  if (!liquidacion) return null;
  return ejercicioCerradoPorPeriodo(liquidacion.consorcioId, liquidacion.periodo, db);
}

/**
 * Una cuenta bancaria con movimientos dentro de un ejercicio no abierto no se
 * puede eliminar: perdería la asociación con los movimientos históricos.
 */
export async function cuentaConMovimientosEnEjercicioCerrado(consorcioId: number, cuentaId: number) {
  const cerrados = await prisma.ejercicio.findMany({
    where: { consorcioId, estado: NO_ABIERTO },
    select: { fechaInicio: true, fechaFin: true },
  });
  if (cerrados.length === 0) return false;
  const movimiento = await prisma.movimientoFondo.findFirst({
    where: {
      consorcioCuentaBancariaId: cuentaId,
      OR: cerrados.map((e) => ({
        fechaMovimiento: { gte: e.fechaInicio, lt: new Date(e.fechaFin.getTime() + 24 * 60 * 60 * 1000) },
      })),
    },
    select: { id: true },
  });
  return Boolean(movimiento);
}

/**
 * Una unidad con expensas de liquidaciones de un ejercicio no abierto no se
 * puede eliminar: el borrado en cascada se llevaría expensas y cobros cerrados.
 */
export async function unidadConExpensasEnEjercicioCerrado(consorcioId: number, unidadId: number) {
  const expensas = await prisma.expensa.findMany({
    where: { unidadId },
    select: { liquidacion: { select: { periodo: true } } },
  });
  const periodos = Array.from(new Set(expensas.map((e) => e.liquidacion.periodo)));
  return algunPeriodoCerrado(consorcioId, periodos);
}
