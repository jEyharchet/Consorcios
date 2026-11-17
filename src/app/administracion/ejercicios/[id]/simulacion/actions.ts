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

export async function confirmarCierreAction(formData: FormData) {
  const { ejercicioId, consorcioId } = leerIds(formData);
  const access = await requireConsorcioRole(consorcioId, ["ADMIN"]);

  const resultado = await confirmarCierreEjercicio({
    ejercicioId,
    consorcioId,
    userId: access.user.id,
    huellaRevisada: formData.get("huella")?.toString() ?? "",
    aceptaObservaciones: formData.get("aceptaObservaciones") === "1",
  });

  if (!resultado.ok) redirect(ruta(ejercicioId, { error: resultado.errores.join("|") }));
  redirect(
    ruta(ejercicioId, {
      ok: `Cierre confirmado (versión ${resultado.version}). La rendición y la hoja del libro quedaron guardadas.`,
      aviso: resultado.avisos.join("|"),
    }),
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

export async function enviarRendicionAction(formData: FormData) {
  const { ejercicioId, consorcioId } = leerIds(formData);
  await requireConsorcioRole(consorcioId, ["ADMIN"]);
  const prueba = formData.get("modo") === "prueba";

  let mensaje: string;
  try {
    const resumen = await enviarRendicionEjercicio({
      ejercicioId,
      consorcioId,
      prueba,
      mensaje: formData.get("mensaje")?.toString() ?? null,
    });
    mensaje = `${prueba ? "Prueba enviada a la administración." : "Rendición enviada a los propietarios."} ${formatEmailSummary(resumen)}`;
  } catch (error) {
    const codigo = error instanceof Error ? error.message : "";
    const texto =
      codigo === "administrador_sin_email"
        ? "No hay un email de administrador vigente para enviar la prueba."
        : codigo === "rendicion_sin_cierre"
          ? "La rendición solo se envía con el cierre confirmado."
          : "No se pudo enviar la rendición.";
    redirect(ruta(ejercicioId, { error: texto }));
  }
  redirect(ruta(ejercicioId, { ok: mensaje }));
}
