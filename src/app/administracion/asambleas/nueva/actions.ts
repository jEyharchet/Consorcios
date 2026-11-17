"use server";

import { redirect } from "next/navigation";

import { ASAMBLEA_ESTADO, ASAMBLEA_TIPO } from "../../../../lib/administracion-shared";
import { FIRMA_ALTO_PX, FIRMA_ESPACIO_PX, parseAjusteFirma } from "../../../../lib/asamblea-convocatoria-preview";
import { actualizarBorradorAsamblea, type PuntoEditor } from "../../../../lib/asambleas-borrador";
import { requireConsorcioRole } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { buildReturnQuery } from "../../shared";

/**
 * Guarda la asamblea desde el editor (alta o borrador existente).
 * - intent "borrador": no exige fecha, hora ni lugar y vuelve al editor.
 * - intent "crear": exige fecha, hora y lugar y va al detalle.
 * En ambos casos la asamblea queda en BORRADOR; convocar se hace desde el detalle.
 */
export async function guardarAsambleaEditor(formData: FormData) {
  const asambleaId = Number(formData.get("asambleaId")) || null;
  const consorcioId = Number(formData.get("consorcioId"));
  const intent = formData.get("intent") === "borrador" ? "borrador" : "crear";

  await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

  const tipoRaw = (formData.get("tipo")?.toString() ?? "").trim();
  const tipo = tipoRaw === ASAMBLEA_TIPO.EXTRAORDINARIA ? ASAMBLEA_TIPO.EXTRAORDINARIA : ASAMBLEA_TIPO.ORDINARIA;
  const fecha = (formData.get("fecha")?.toString() ?? "").trim();
  const hora = (formData.get("hora")?.toString() ?? "").trim();
  const lugar = (formData.get("lugar")?.toString() ?? "").trim();
  const observaciones = (formData.get("observaciones")?.toString() ?? "").trim();
  const firmaEspacioPx = parseAjusteFirma(formData.get("firmaEspacioPx"), FIRMA_ESPACIO_PX);
  const firmaAltoPx = parseAjusteFirma(formData.get("firmaAltoPx"), FIRMA_ALTO_PX);

  const ids = formData.getAll("ordenId").map((value) => Number(value.toString()) || null);
  const puntos: PuntoEditor[] = formData
    .getAll("ordenTitulo")
    .map((value, index) => ({ id: ids[index] ?? null, titulo: value.toString().trim() }))
    .filter((punto) => punto.titulo.length > 0);

  const editorPath = asambleaId ? `/administracion/asambleas/${asambleaId}/editar` : "/administracion/asambleas/nueva";

  if (intent === "crear") {
    if (!fecha) redirect(`${editorPath}${buildReturnQuery({ error: "fecha_requerida" })}`);
    if (!hora) redirect(`${editorPath}${buildReturnQuery({ error: "hora_requerida" })}`);
    if (!lugar) redirect(`${editorPath}${buildReturnQuery({ error: "lugar_requerido" })}`);
  }

  const datos = {
    tipo,
    fecha: fecha ? new Date(`${fecha}T00:00:00`) : null,
    hora,
    lugar,
    observaciones: observaciones || null,
    firmaEspacioPx,
    firmaAltoPx,
  };

  let id: number;

  if (!asambleaId) {
    const creada = await prisma.asamblea.create({
      data: {
        consorcioId,
        ...datos,
        convocatoriaTexto: null,
        estado: ASAMBLEA_ESTADO.BORRADOR,
        ordenDia: {
          create: puntos.map((punto, index) => ({ orden: index + 1, titulo: punto.titulo, descripcion: null })),
        },
      },
      select: { id: true },
    });
    id = creada.id;
  } else {
    const resultado = await actualizarBorradorAsamblea(asambleaId, consorcioId, datos, puntos);
    if (resultado !== "ok") {
      redirect(`${editorPath}${buildReturnQuery({ error: resultado })}`);
    }
    id = asambleaId;
  }

  if (intent === "borrador") {
    redirect(`/administracion/asambleas/${id}/editar${buildReturnQuery({ ok: "borrador_guardado" })}`);
  }

  redirect(`/administracion/asambleas/${id}`);
}
