"use server";

import { redirect } from "next/navigation";

import { enviarRendicionEjercicio } from "../../../../../lib/administracion";
import { requireConsorcioRole } from "../../../../../lib/auth";
import {
  cancelarConfirmacionInterrumpida,
  confirmarCierreEjercicio,
  guardarNotasRendicion,
  reabrirEjercicio,
} from "../../../../../lib/cierre-confirmacion";
import { formatEmailSummary } from "../../../../../lib/email-tracking";
import { buildReturnQuery } from "../../../shared";

// Acciones del cierre del ejercicio (solo ADMIN). Los mensajes vuelven por la
// query (ok / error / aviso, separados por "|"), como en el resto del módulo.

function leerIds(formData: FormData) {
  return {
    ejercicioId: Number(formData.get("ejercicioId")),
    consorcioId: Number(formData.get("consorcioId")),
  };
}

function ruta(ejercicioId: number, query: Record<string, string | undefined>) {
  return `/administracion/ejercicios/${ejercicioId}/simulacion${buildReturnQuery(query)}`;
}

export async function guardarNotasAction(formData: FormData) {
  const { ejercicioId, consorcioId } = leerIds(formData);
  await requireConsorcioRole(consorcioId, ["ADMIN"]);

  const ok = await guardarNotasRendicion(ejercicioId, consorcioId, formData.get("notas")?.toString() ?? "");
  redirect(
    ruta(ejercicioId, ok ? { ok: "Notas de la rendición guardadas." } : { error: "El ejercicio no está abierto." }),
  );
}

export async function cancelarConfirmacionAction(formData: FormData) {
  const { ejercicioId, consorcioId } = leerIds(formData);
  await requireConsorcioRole(consorcioId, ["ADMIN"]);

  const ok = await cancelarConfirmacionInterrumpida(ejercicioId, consorcioId);
  redirect(
    ruta(
      ejercicioId,
      ok
        ? { ok: "Se canceló la confirmación interrumpida: el ejercicio volvió a estar abierto." }
        : { error: "La confirmación sigue en curso (empezó hace menos de 5 minutos) o ya terminó." },
    ),
  );
}

export async function reabrirEjercicioAction(formData: FormData) {
  const { ejercicioId, consorcioId } = leerIds(formData);
  const access = await requireConsorcioRole(consorcioId, ["ADMIN"]);

  const resultado = await reabrirEjercicio({
    ejercicioId,
    consorcioId,
    userId: access.user.id,
    motivo: formData.get("motivo")?.toString() ?? "",
  });

  if (!resultado.ok) redirect(ruta(ejercicioId, { error: resultado.errores.join("|") }));
  redirect(
    ruta(ejercicioId, {
      ok: `Ejercicio reabierto. La versión ${resultado.version} se conserva como reabierta; al terminar las correcciones, confirmá el cierre de nuevo.`,
      aviso: resultado.avisos.join("|"),
    }),
  );
}

export type ResultadoEnvio = { ok: true; mensaje: string } | { ok: false; error: string };

function mensajeErrorEnvio(error: unknown) {
  const codigo = error instanceof Error ? error.message : "";
  if (codigo === "administrador_sin_email") return "No hay un email de administrador vigente para enviar la prueba.";
  if (codigo === "rendicion_sin_cierre") return "La rendición se envía a los propietarios con el ejercicio cerrado.";
  return "No se pudo enviar la rendición.";
}

/** Prueba solo para la administración. No cierra el ejercicio. */
export async function enviarPruebaRendicionAction(formData: FormData): Promise<ResultadoEnvio> {
  const { ejercicioId, consorcioId } = leerIds(formData);
  await requireConsorcioRole(consorcioId, ["ADMIN"]);
  try {
    const resumen = await enviarRendicionEjercicio({
      ejercicioId,
      consorcioId,
      prueba: true,
      mensaje: formData.get("mensaje")?.toString() ?? null,
    });
    return { ok: true, mensaje: `Prueba enviada a la administración. ${formatEmailSummary(resumen)}` };
  } catch (error) {
    return { ok: false, error: mensajeErrorEnvio(error) };
  }
}

/**
 * Cierra el ejercicio (confirma la versión con la rendición y la hoja del
 * libro) y envía la rendición a los propietarios. Si el envío falla, el
 * ejercicio queda cerrado y se puede reenviar.
 */
export async function cerrarYEnviarRendicionAction(formData: FormData): Promise<ResultadoEnvio> {
  const { ejercicioId, consorcioId } = leerIds(formData);
  const access = await requireConsorcioRole(consorcioId, ["ADMIN"]);

  const cierre = await confirmarCierreEjercicio({
    ejercicioId,
    consorcioId,
    userId: access.user.id,
    huellaRevisada: formData.get("huella")?.toString() ?? "",
    aceptaObservaciones: formData.get("aceptaObservaciones") === "1",
  });
  if (!cierre.ok) return { ok: false, error: cierre.errores.join(" ") };

  try {
    const resumen = await enviarRendicionEjercicio({
      ejercicioId,
      consorcioId,
      prueba: false,
      mensaje: formData.get("mensaje")?.toString() ?? null,
    });
    return {
      ok: true,
      mensaje: [`Ejercicio cerrado (versión ${cierre.version}) y rendición enviada.`, formatEmailSummary(resumen), ...cierre.avisos].join(" "),
    };
  } catch (error) {
    return {
      ok: false,
      error: `El ejercicio quedó cerrado (versión ${cierre.version}), pero el envío falló: ${mensajeErrorEnvio(error)} Usá «Reenviar a los propietarios».`,
    };
  }
}

/** Reenvío de la versión vigente a los propietarios (ejercicio ya cerrado). */
export async function reenviarRendicionAction(formData: FormData): Promise<ResultadoEnvio> {
  const { ejercicioId, consorcioId } = leerIds(formData);
  await requireConsorcioRole(consorcioId, ["ADMIN"]);
  try {
    const resumen = await enviarRendicionEjercicio({
      ejercicioId,
      consorcioId,
      prueba: false,
      mensaje: formData.get("mensaje")?.toString() ?? null,
    });
    return { ok: true, mensaje: `Rendición reenviada a los propietarios. ${formatEmailSummary(resumen)}` };
  } catch (error) {
    return { ok: false, error: mensajeErrorEnvio(error) };
  }
}
