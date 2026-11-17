import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { aperturaDesdeCierre, leerAperturaDetalle } from "./apertura";
import { simularCierreEjercicio, type SimulacionCierre } from "./cierre-simulacion";
import { formatFechaCalendarioAR, hoyFechaCalendarioAR, sumarDias } from "./ejercicios";
import { prisma } from "./prisma";
import { generarHojaLibroAdministracionPdf, generarRendicionPdf, obtenerDatosRendicion } from "./rendicion";

// Confirmación y reapertura del cierre de un ejercicio. Ver docs/cierre-anual.md.
//
// Confirmar:
// 1. El ejercicio pasa de ABIERTO a CERRANDO: desde ese momento se bloquean las
//    escrituras con fecha o período del ejercicio (src/lib/ejercicio-bloqueo.ts).
// 2. Se recalcula la simulación y se compara su huella con la que revisó el
//    usuario: si los datos cambiaron, se vuelve a ABIERTO y hay que revisar de nuevo.
// 3. Se generan la rendición (con el anexo de comprobantes) y la hoja del libro.
// 4. En una transacción: se guarda la versión (CierreEjercicio), el ejercicio
//    pasa a CERRADO y la apertura del ejercicio siguiente toma los saldos al cierre.
// Si algo falla, el ejercicio vuelve a ABIERTO.
//
// Reabrir: la versión vigente queda REABIERTA (se conserva, con el motivo), el
// ejercicio vuelve a ABIERTO y, si la apertura del siguiente salió de esa
// versión, vuelve a PENDIENTE hasta la nueva confirmación.

export type ResultadoCierre = { ok: true; version: number; avisos: string[] } | { ok: false; errores: string[] };

/** JSON con claves ordenadas, para que la huella no dependa del orden de las propiedades. */
function jsonCanonico(valor: unknown): string {
  return JSON.stringify(valor, (_clave, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

/** Huella de lo que se confirma: la simulación (sin la hora de cálculo) y las notas de la rendición. */
export function huellaSimulacion(simulacion: NonNullable<SimulacionCierre>, notas: string | null) {
  const { generadoAt: _generadoAt, ...resto } = simulacion;
  return createHash("sha256")
    .update(jsonCanonico({ simulacion: resto, notas: notas?.trim() || null }))
    .digest("hex");
}

/** Reconstruye las fechas de una simulación guardada como JSON. */
export function revivirSimulacion(resultados: Prisma.JsonValue): NonNullable<SimulacionCierre> {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  return JSON.parse(JSON.stringify(resultados), (_clave, v) => (typeof v === "string" && iso.test(v) ? new Date(v) : v));
}

type EjercicioRequisitos = { id: number; consorcioId: number; numero: number; fechaInicio: Date; fechaFin: Date };

/**
 * Condiciones para confirmar. `bloqueantes` impide confirmar; `aVerificar`
 * son las observaciones MEDIA, que se pueden confirmar dejando constancia de
 * que se revisaron.
 */
export async function requisitosConfirmacion(ejercicio: EjercicioRequisitos, simulacion: NonNullable<SimulacionCierre>) {
  const bloqueantes: string[] = [];
  const hoy = hoyFechaCalendarioAR();

  if (hoy.getTime() <= ejercicio.fechaFin.getTime()) {
    bloqueantes.push(`El ejercicio termina el ${formatFechaCalendarioAR(ejercicio.fechaFin)}: se puede cerrar desde el día siguiente.`);
  }

  const anterior = await prisma.ejercicio.findFirst({
    where: { consorcioId: ejercicio.consorcioId, fechaFin: { lt: ejercicio.fechaInicio } },
    orderBy: { fechaFin: "desc" },
    select: { numero: true, estado: true },
  });
  if (anterior && anterior.estado !== "CERRADO") {
    bloqueantes.push(`Primero hay que cerrar el ejercicio N.º ${anterior.numero}.`);
  }

  if (simulacion.fondosFinal === null) {
    bloqueantes.push("Faltan los saldos de apertura: sin ellos no se puede calcular caja y bancos al cierre.");
  }

  const altas = simulacion.inconsistencias.filter((i) => i.gravedad === "ALTA");
  for (const i of altas) bloqueantes.push(`Observación a revisar: ${i.titulo}.`);

  const aVerificar = simulacion.inconsistencias.filter((i) => i.gravedad === "MEDIA").map((i) => i.titulo);
  return { bloqueantes, aVerificar };
}

async function nombreUsuario(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return user?.name ?? user?.email ?? null;
}

export async function confirmarCierreEjercicio(params: {
  ejercicioId: number;
  consorcioId: number;
  userId: string;
  huellaRevisada: string;
  aceptaObservaciones: boolean;
}): Promise<ResultadoCierre> {
  const { ejercicioId, consorcioId, userId } = params;

  const marcado = await prisma.ejercicio.updateMany({
    where: { id: ejercicioId, consorcioId, estado: "ABIERTO" },
    data: { estado: "CERRANDO" },
  });
  if (marcado.count === 0) {
    return { ok: false, errores: ["El ejercicio no está abierto (puede que otra persona lo esté cerrando)."] };
  }

  const volverAAbierto = () =>
    prisma.ejercicio.updateMany({ where: { id: ejercicioId, estado: "CERRANDO" }, data: { estado: "ABIERTO" } });

  try {
    const [ejercicio, simulacion] = await Promise.all([
      prisma.ejercicio.findUniqueOrThrow({
        where: { id: ejercicioId },
        select: { id: true, consorcioId: true, numero: true, fechaInicio: true, fechaFin: true, notasRendicion: true },
      }),
      simularCierreEjercicio(ejercicioId, consorcioId),
    ]);
    if (!simulacion) {
      await volverAAbierto();
      return { ok: false, errores: ["El ejercicio no existe en el consorcio activo."] };
    }

    const huella = huellaSimulacion(simulacion, ejercicio.notasRendicion);
    if (huella !== params.huellaRevisada) {
      await volverAAbierto();
      return {
        ok: false,
        errores: [
          "Los datos del ejercicio o las notas cambiaron desde que abriste la simulación. Revisala de nuevo antes de confirmar.",
        ],
      };
    }

    const { bloqueantes, aVerificar } = await requisitosConfirmacion(ejercicio, simulacion);
    if (bloqueantes.length > 0) {
      await volverAAbierto();
      return { ok: false, errores: bloqueantes };
    }
    if (aVerificar.length > 0 && !params.aceptaObservaciones) {
      await volverAAbierto();
      return { ok: false, errores: ["Marcá que revisaste las observaciones a verificar para confirmar el cierre."] };
    }

    const ultima = await prisma.cierreEjercicio.aggregate({ where: { ejercicioId }, _max: { version: true } });
    const numeroVersion = (ultima._max.version ?? 0) + 1;
    const version = {
      numero: numeroVersion,
      confirmadoAt: new Date(),
      confirmadoPor: await nombreUsuario(userId),
      huella,
    };

    const rendicion = await obtenerDatosRendicion(ejercicioId, consorcioId, { simulacion, version });
    if (!rendicion) {
      await volverAAbierto();
      return { ok: false, errores: ["No se pudieron reunir los datos de la rendición."] };
    }
    const rendicionPdf = await generarRendicionPdf(rendicion.datos, rendicion.archivos);
    const hojaLibroPdf = await generarHojaLibroAdministracionPdf(rendicion.datos);

    const avisos = await prisma.$transaction(
      async (tx) => {
        const actual = await tx.ejercicio.findUniqueOrThrow({ where: { id: ejercicioId }, select: { estado: true } });
        if (actual.estado !== "CERRANDO") throw new Error("confirmacion_cancelada");

        const cierre = await tx.cierreEjercicio.create({
          data: {
            ejercicioId,
            version: numeroVersion,
            confirmadoAt: version.confirmadoAt,
            confirmadoPorUserId: userId,
            notas: ejercicio.notasRendicion?.trim() || null,
            resultados: JSON.parse(JSON.stringify(simulacion)) as Prisma.InputJsonValue,
            huella,
            rendicionPdf,
            hojaLibroPdf,
            comprobantesAnexados: rendicion.archivos.filter((a) => a.incorporado).length,
          },
          select: { id: true },
        });
        await tx.ejercicio.update({ where: { id: ejercicioId }, data: { estado: "CERRADO" } });

        return trasladarApertura(tx, {
          consorcioId,
          ejercicio,
          simulacion,
          cierreId: cierre.id,
          version: numeroVersion,
          userId,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
    );

    const anexo = rendicion.archivos;
    const noIncorporados = anexo.filter((a) => !a.incorporado);
    if (noIncorporados.length > 0) {
      avisos.push(
        `No se pudieron incorporar al PDF ${noIncorporados.length} comprobantes (${noIncorporados
          .map((a) => a.nombre)
          .join(", ")}): quedan indicados en el índice del anexo.`,
      );
    }
    return { ok: true, version: numeroVersion, avisos };
  } catch (error) {
    await volverAAbierto();
    if (error instanceof Error && error.message === "confirmacion_cancelada") {
      return { ok: false, errores: ["La confirmación se canceló mientras se generaban los documentos."] };
    }
    throw error;
  }
}

/** La apertura del ejercicio siguiente toma los saldos al cierre del confirmado. */
async function trasladarApertura(
  tx: Prisma.TransactionClient,
  params: {
    consorcioId: number;
    ejercicio: { id: number; numero: number; fechaFin: Date };
    simulacion: NonNullable<SimulacionCierre>;
    cierreId: number;
    version: number;
    userId: string;
  },
) {
  const avisos: string[] = [];
  const siguiente = await tx.ejercicio.findFirst({
    where: { consorcioId: params.consorcioId, fechaInicio: sumarDias(params.ejercicio.fechaFin, 1) },
    select: { id: true, numero: true, estado: true, aperturaEstado: true, aperturaDetalle: true },
  });
  if (!siguiente) return avisos;

  const detalleActual = leerAperturaDetalle(siguiente.aperturaDetalle);
  const derivable =
    siguiente.estado === "ABIERTO" &&
    (siguiente.aperturaEstado === "PENDIENTE" || detalleActual?.origen?.ejercicioId === params.ejercicio.id);
  if (!derivable) {
    avisos.push(
      `La apertura del ejercicio N.º ${siguiente.numero} ya estaba registrada a mano: no se reemplazó con los saldos al cierre.`,
    );
    return avisos;
  }

  const detalle = aperturaDesdeCierre(params.simulacion, {
    ejercicioId: params.ejercicio.id,
    numero: params.ejercicio.numero,
    cierreId: params.cierreId,
    version: params.version,
  });
  if (!detalle) return avisos;

  await tx.ejercicio.update({
    where: { id: siguiente.id },
    data: {
      aperturaEstado: "INFORMADA",
      aperturaDetalle: detalle as unknown as Prisma.InputJsonValue,
      aperturaConfirmadaAt: new Date(),
      aperturaConfirmadaPorUserId: params.userId,
      aperturaObservaciones: `Saldos al cierre del ejercicio N.º ${params.ejercicio.numero} (versión ${params.version}).`,
    },
  });
  avisos.push(`La apertura del ejercicio N.º ${siguiente.numero} quedó informada con los saldos al cierre.`);
  return avisos;
}

/**
 * Apertura de un ejercicio nuevo cuyo anterior ya está cerrado: se toma de la
 * versión vigente de ese cierre. Devuelve null si no corresponde.
 */
export async function aperturaDesdeEjercicioAnterior(tx: Prisma.TransactionClient, ejercicioAnteriorId: number) {
  const anterior = await tx.ejercicio.findUnique({
    where: { id: ejercicioAnteriorId },
    select: { id: true, numero: true, estado: true },
  });
  if (anterior?.estado !== "CERRADO") return null;
  const cierre = await tx.cierreEjercicio.findFirst({
    where: { ejercicioId: anterior.id, estado: "VIGENTE" },
    select: { id: true, version: true, resultados: true },
  });
  if (!cierre) return null;
  return aperturaDesdeCierre(revivirSimulacion(cierre.resultados), {
    ejercicioId: anterior.id,
    numero: anterior.numero,
    cierreId: cierre.id,
    version: cierre.version,
  });
}

export async function reabrirEjercicio(params: {
  ejercicioId: number;
  consorcioId: number;
  userId: string;
  motivo: string;
}): Promise<ResultadoCierre> {
  const motivo = params.motivo.trim();
  if (motivo.length < 10) {
    return { ok: false, errores: ["Indicá el motivo de la reapertura (al menos 10 caracteres): queda registrado."] };
  }

  return prisma.$transaction(
    async (tx) => {
      const ejercicio = await tx.ejercicio.findFirst({
        where: { id: params.ejercicioId, consorcioId: params.consorcioId },
        select: { id: true, numero: true, estado: true, fechaFin: true },
      });
      if (!ejercicio) return { ok: false as const, errores: ["El ejercicio no existe en el consorcio activo."] };
      if (ejercicio.estado !== "CERRADO") return { ok: false as const, errores: ["El ejercicio no está cerrado."] };

      const siguiente = await tx.ejercicio.findFirst({
        where: { consorcioId: params.consorcioId, fechaInicio: sumarDias(ejercicio.fechaFin, 1) },
        select: { id: true, numero: true, estado: true, aperturaDetalle: true },
      });
      if (siguiente && siguiente.estado !== "ABIERTO") {
        return {
          ok: false as const,
          errores: [`El ejercicio N.º ${siguiente.numero} está cerrado: hay que reabrirlo primero.`],
        };
      }

      const vigente = await tx.cierreEjercicio.findFirst({
        where: { ejercicioId: ejercicio.id, estado: "VIGENTE" },
        select: { id: true, version: true },
      });
      const ahora = new Date();
      if (vigente) {
        await tx.cierreEjercicio.update({
          where: { id: vigente.id },
          data: { estado: "REABIERTO", reabiertoAt: ahora, reabiertoPorUserId: params.userId, motivoReapertura: motivo },
        });
      }
      await tx.ejercicio.update({ where: { id: ejercicio.id }, data: { estado: "ABIERTO" } });

      const avisos: string[] = [];
      if (siguiente && vigente && leerAperturaDetalle(siguiente.aperturaDetalle)?.origen?.cierreId === vigente.id) {
        await tx.ejercicio.update({
          where: { id: siguiente.id },
          data: {
            aperturaEstado: "PENDIENTE",
            aperturaDetalle: Prisma.DbNull,
            aperturaConfirmadaAt: null,
            aperturaConfirmadaPorUserId: null,
            aperturaObservaciones: `El ejercicio N.º ${ejercicio.numero} se reabrió el ${formatFechaCalendarioAR(
              hoyFechaCalendarioAR(ahora),
            )}: la apertura se vuelve a tomar al confirmar de nuevo su cierre.`,
          },
        });
        avisos.push(`La apertura del ejercicio N.º ${siguiente.numero} volvió a pendiente hasta la nueva confirmación.`);
      }

      return { ok: true as const, version: vigente?.version ?? 0, avisos };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Una confirmación interrumpida (p. ej. por un corte) deja el ejercicio en CERRANDO: se vuelve a ABIERTO. */
export async function cancelarConfirmacionInterrumpida(ejercicioId: number, consorcioId: number) {
  const hace5Minutos = new Date(Date.now() - 5 * 60 * 1000);
  const r = await prisma.ejercicio.updateMany({
    where: { id: ejercicioId, consorcioId, estado: "CERRANDO", updatedAt: { lt: hace5Minutos } },
    data: { estado: "ABIERTO" },
  });
  return r.count > 0;
}

export const MAX_NOTAS_RENDICION = 6000;

export async function guardarNotasRendicion(ejercicioId: number, consorcioId: number, notas: string) {
  const texto = notas.trim().slice(0, MAX_NOTAS_RENDICION) || null;
  const r = await prisma.ejercicio.updateMany({
    where: { id: ejercicioId, consorcioId, estado: "ABIERTO" },
    data: { notasRendicion: texto },
  });
  return r.count > 0;
}

/** Versión del cierre: la indicada o, sin número, la vigente. */
export async function obtenerCierre(ejercicioId: number, version?: number) {
  return prisma.cierreEjercicio.findFirst({
    where: version ? { ejercicioId, version } : { ejercicioId, estado: "VIGENTE" },
  });
}
