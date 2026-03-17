import Link from "next/link";
import { redirect } from "next/navigation";

import { enviarConvocatoriaAsamblea, enviarSimulacionConvocatoriaAsamblea } from "../../../../lib/administracion";
import { ADMIN_EMAIL_TIPO_ENVIO, ASAMBLEA_ESTADO, ASAMBLEA_TIPO } from "../../../../lib/administracion-shared";
import { requireConsorcioAccess, requireConsorcioRole } from "../../../../lib/auth";
import { formatEmailSummary } from "../../../../lib/email-tracking";
import { prisma } from "../../../../lib/prisma";
import { buildReturnQuery, formatDate, formatDateInput, formatDateTime } from "../../shared";

function getFeedback(searchParams: {
  ok?: string;
  error?: string;
  enviados?: string;
  fallidos?: string;
  sinDestinatario?: string;
}) {
  if (searchParams.ok === "convocatoria_ok") {
    const enviados = Number(searchParams.enviados ?? 0);
    const fallidos = Number(searchParams.fallidos ?? 0);
    const sinDestinatario = Number(searchParams.sinDestinatario ?? 0);

    return {
      type: "ok" as const,
      text: formatEmailSummary({
        total: enviados + fallidos + sinDestinatario,
        enviados,
        fallidos,
        sinDestinatario,
      }),
    };
  }

  if (searchParams.ok === "simulacion_ok") {
    return {
      type: "ok" as const,
      text: "La simulacion de convocatoria se envio correctamente al administrador del consorcio.",
    };
  }

  switch (searchParams.ok) {
    case "asamblea_actualizada":
      return { type: "ok" as const, text: "La asamblea se actualizo correctamente." };
    case "acta_guardada":
      return { type: "ok" as const, text: "El texto del acta se guardo correctamente." };
    case "orden_agregado":
      return { type: "ok" as const, text: "El punto del orden del dia se agrego correctamente." };
    case "orden_actualizado":
      return { type: "ok" as const, text: "El punto del orden del dia se actualizo correctamente." };
    case "orden_eliminado":
      return { type: "ok" as const, text: "El punto del orden del dia se elimino correctamente." };
  }

  switch (searchParams.error) {
    case "fecha_requerida":
      return { type: "error" as const, text: "La fecha es obligatoria." };
    case "hora_requerida":
      return { type: "error" as const, text: "La hora es obligatoria." };
    case "lugar_requerido":
      return { type: "error" as const, text: "El lugar es obligatorio." };
    case "orden_invalido":
      return { type: "error" as const, text: "El orden debe ser un numero entero positivo." };
    case "titulo_requerido":
      return { type: "error" as const, text: "El titulo del punto es obligatorio." };
    case "asamblea_inexistente":
      return { type: "error" as const, text: "No se encontro la asamblea indicada." };
    case "asamblea_sin_orden":
      return { type: "error" as const, text: "Debes cargar al menos un punto del orden del dia antes de convocar." };
    case "administrador_sin_email":
      return {
        type: "error" as const,
        text: "El consorcio no tiene un email de administrador vigente configurado para enviar la simulacion.",
      };
    case "simulacion_error":
      return {
        type: "error" as const,
        text: "No se pudo enviar la simulacion de convocatoria. Intenta nuevamente en unos minutos.",
      };
    default:
      return null;
  }
}

function tipoEnvioLabel(tipoEnvio: string) {
  if (tipoEnvio === ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_SIMULACION_ADMIN) {
    return "Simulacion al administrador";
  }

  if (tipoEnvio === ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_CONVOCATORIA) {
    return "Convocatoria real";
  }

  return tipoEnvio;
}

function estadoClass(estado: string) {
  if (estado === "CONVOCADA") {
    return "bg-blue-100 text-blue-800";
  }

  if (estado === "REALIZADA") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (estado === "CERRADA") {
    return "bg-slate-200 text-slate-800";
  }

  return "bg-amber-100 text-amber-800";
}

export default async function AsambleaDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    ok?: string;
    error?: string;
    enviados?: string;
    fallidos?: string;
    sinDestinatario?: string;
  };
}) {
  const asambleaId = Number(params.id);

  const asamblea = Number.isInteger(asambleaId)
    ? await prisma.asamblea.findUnique({
        where: { id: asambleaId },
        include: {
          consorcio: {
            select: {
              id: true,
              nombre: true,
            },
          },
          ordenDia: {
            orderBy: [{ orden: "asc" }, { id: "asc" }],
          },
          enviosEmail: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
            include: {
              unidad: {
                select: {
                  identificador: true,
                  tipo: true,
                },
              },
            },
          },
        },
      })
    : null;

  if (!asamblea) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Detalle de asamblea</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontro la asamblea solicitada.
        </p>
      </main>
    );
  }

  const access = await requireConsorcioAccess(asamblea.consorcioId);

  const canOperate =
    access.isSuperAdmin ||
    access.assignments.some(
      (assignment) =>
        assignment.consorcioId === asamblea.consorcioId &&
        (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
    );

  async function actualizarAsamblea(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    const consorcioId = Number(formData.get("consorcioId"));
    const tipo = (formData.get("tipo")?.toString() ?? ASAMBLEA_TIPO.ORDINARIA).trim();
    const fecha = (formData.get("fecha")?.toString() ?? "").trim();
    const hora = (formData.get("hora")?.toString() ?? "").trim();
    const lugar = (formData.get("lugar")?.toString() ?? "").trim();
    const convocatoriaTexto = (formData.get("convocatoriaTexto")?.toString() ?? "").trim();
    const observaciones = (formData.get("observaciones")?.toString() ?? "").trim();
    const estado = (formData.get("estado")?.toString() ?? ASAMBLEA_ESTADO.BORRADOR).trim();

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    if (!fecha) {
      redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: "fecha_requerida" })}`);
    }

    if (!hora) {
      redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: "hora_requerida" })}`);
    }

    if (!lugar) {
      redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: "lugar_requerido" })}`);
    }

    await prisma.asamblea.update({
      where: { id },
      data: {
        tipo,
        fecha: new Date(`${fecha}T00:00:00`),
        hora,
        lugar,
        convocatoriaTexto: convocatoriaTexto || null,
        observaciones: observaciones || null,
        estado,
      },
    });

    redirect(`/administracion/asambleas/${id}${buildReturnQuery({ ok: "asamblea_actualizada" })}`);
  }

  async function guardarActa(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    const consorcioId = Number(formData.get("consorcioId"));
    const actaTexto = (formData.get("actaTexto")?.toString() ?? "").trim();

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    await prisma.asamblea.update({
      where: { id },
      data: {
        actaTexto: actaTexto || null,
      },
    });

    redirect(`/administracion/asambleas/${id}${buildReturnQuery({ ok: "acta_guardada" })}#acta`);
  }

  async function agregarOrdenDia(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    const consorcioId = Number(formData.get("consorcioId"));
    const orden = Number(formData.get("orden"));
    const titulo = (formData.get("titulo")?.toString() ?? "").trim();
    const descripcion = (formData.get("descripcion")?.toString() ?? "").trim();

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    if (!Number.isInteger(orden) || orden <= 0) {
      redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: "orden_invalido" })}#orden-dia`);
    }

    if (!titulo) {
      redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: "titulo_requerido" })}#orden-dia`);
    }

    await prisma.asambleaOrdenDia.create({
      data: {
        asambleaId: id,
        orden,
        titulo,
        descripcion: descripcion || null,
      },
    });

    redirect(`/administracion/asambleas/${id}${buildReturnQuery({ ok: "orden_agregado" })}#orden-dia`);
  }

  async function actualizarOrdenDia(formData: FormData) {
    "use server";

    const asambleaOrdenDiaId = Number(formData.get("asambleaOrdenDiaId"));
    const consorcioId = Number(formData.get("consorcioId"));
    const asambleaIdValue = Number(formData.get("asambleaId"));
    const orden = Number(formData.get("orden"));
    const titulo = (formData.get("titulo")?.toString() ?? "").trim();
    const descripcion = (formData.get("descripcion")?.toString() ?? "").trim();

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    if (!Number.isInteger(orden) || orden <= 0) {
      redirect(`/administracion/asambleas/${asambleaIdValue}${buildReturnQuery({ error: "orden_invalido" })}#orden-dia`);
    }

    if (!titulo) {
      redirect(`/administracion/asambleas/${asambleaIdValue}${buildReturnQuery({ error: "titulo_requerido" })}#orden-dia`);
    }

    await prisma.asambleaOrdenDia.update({
      where: { id: asambleaOrdenDiaId },
      data: {
        orden,
        titulo,
        descripcion: descripcion || null,
      },
    });

    redirect(`/administracion/asambleas/${asambleaIdValue}${buildReturnQuery({ ok: "orden_actualizado" })}#orden-dia`);
  }

  async function eliminarOrdenDia(formData: FormData) {
    "use server";

    const asambleaOrdenDiaId = Number(formData.get("asambleaOrdenDiaId"));
    const consorcioId = Number(formData.get("consorcioId"));
    const asambleaIdValue = Number(formData.get("asambleaId"));

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    await prisma.asambleaOrdenDia.delete({
      where: { id: asambleaOrdenDiaId },
    });

    redirect(`/administracion/asambleas/${asambleaIdValue}${buildReturnQuery({ ok: "orden_eliminado" })}#orden-dia`);
  }

  async function enviarConvocatoria(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    const consorcioId = Number(formData.get("consorcioId"));

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    const existente = await prisma.asamblea.findUnique({
      where: { id },
      select: {
        id: true,
        ordenDia: {
          select: { id: true },
        },
      },
    });

    if (!existente) {
      redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: "asamblea_inexistente" })}`);
    }

    if (existente.ordenDia.length === 0) {
      redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: "asamblea_sin_orden" })}`);
    }

    const summary = await enviarConvocatoriaAsamblea(id);

    redirect(
      `/administracion/asambleas/${id}${buildReturnQuery({
        ok: "convocatoria_ok",
        enviados: String(summary.enviados),
        fallidos: String(summary.fallidos),
        sinDestinatario: String(summary.sinDestinatario),
      })}`,
    );
  }

  async function enviarSimulacionConvocatoria(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    const consorcioId = Number(formData.get("consorcioId"));

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    try {
      await enviarSimulacionConvocatoriaAsamblea(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "error_desconocido";
      if (message === "asamblea_sin_orden" || message === "asamblea_inexistente" || message === "administrador_sin_email") {
        redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: message })}`);
      }

      redirect(`/administracion/asambleas/${id}${buildReturnQuery({ error: "simulacion_error" })}`);
    }

    redirect(`/administracion/asambleas/${id}${buildReturnQuery({ ok: "simulacion_ok" })}`);
  }

  const feedback = getFeedback(searchParams ?? {});
  const convocatoriasEnviadas = asamblea.enviosEmail.filter(
    (envio) => envio.estado === "ENVIADO" && envio.tipoEnvio === ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_CONVOCATORIA,
  ).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/administracion/asambleas" className="text-sm text-blue-600 hover:underline">
            Volver a asambleas
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">
            Asamblea {asamblea.tipo.toLowerCase()} - {formatDate(asamblea.fecha)}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{asamblea.consorcio.nombre}</p>
        </div>

        <div className="flex items-center gap-3">
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${estadoClass(asamblea.estado)}`}>
            {asamblea.estado}
          </span>
        </div>
      </header>

      {feedback ? (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            feedback.type === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Puntos del orden del dia</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{asamblea.ordenDia.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Convocatorias enviadas</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{convocatoriasEnviadas}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Ultima actualizacion</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{formatDateTime(asamblea.updatedAt)}</p>
        </article>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Datos generales</h2>
                <p className="mt-1 text-sm text-slate-500">Configuracion de la convocatoria y estado de seguimiento.</p>
              </div>
            </div>

            {canOperate ? (
              <form action={actualizarAsamblea} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={asamblea.id} />
                <input type="hidden" name="consorcioId" value={asamblea.consorcioId} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="tipo" className="text-sm font-medium text-slate-700">Tipo</label>
                    <select id="tipo" name="tipo" defaultValue={asamblea.tipo} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                      <option value={ASAMBLEA_TIPO.ORDINARIA}>ORDINARIA</option>
                      <option value={ASAMBLEA_TIPO.EXTRAORDINARIA}>EXTRAORDINARIA</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="estado" className="text-sm font-medium text-slate-700">Estado</label>
                    <select id="estado" name="estado" defaultValue={asamblea.estado} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                      <option value={ASAMBLEA_ESTADO.BORRADOR}>BORRADOR</option>
                      <option value={ASAMBLEA_ESTADO.CONVOCADA}>CONVOCADA</option>
                      <option value={ASAMBLEA_ESTADO.REALIZADA}>REALIZADA</option>
                      <option value={ASAMBLEA_ESTADO.CERRADA}>CERRADA</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label htmlFor="fecha" className="text-sm font-medium text-slate-700">Fecha</label>
                    <input id="fecha" name="fecha" type="date" defaultValue={formatDateInput(asamblea.fecha)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="hora" className="text-sm font-medium text-slate-700">Hora</label>
                    <input id="hora" name="hora" type="time" defaultValue={asamblea.hora} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="lugar" className="text-sm font-medium text-slate-700">Lugar</label>
                    <input id="lugar" name="lugar" defaultValue={asamblea.lugar} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="convocatoriaTexto" className="text-sm font-medium text-slate-700">Texto de convocatoria</label>
                  <textarea id="convocatoriaTexto" name="convocatoriaTexto" rows={6} defaultValue={asamblea.convocatoriaTexto ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <div className="space-y-1">
                  <label htmlFor="observaciones" className="text-sm font-medium text-slate-700">Observaciones</label>
                  <textarea id="observaciones" name="observaciones" rows={4} defaultValue={asamblea.observaciones ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Guardar cambios
                </button>
              </form>
            ) : (
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p><strong>Fecha:</strong> {formatDate(asamblea.fecha)}</p>
                <p><strong>Hora:</strong> {asamblea.hora}</p>
                <p><strong>Lugar:</strong> {asamblea.lugar}</p>
                <p><strong>Convocatoria:</strong> {asamblea.convocatoriaTexto ?? "-"}</p>
                <p><strong>Observaciones:</strong> {asamblea.observaciones ?? "-"}</p>
              </div>
            )}
          </article>

          <article id="orden-dia" className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Orden del dia</h2>
            <p className="mt-1 text-sm text-slate-500">Puntos habilitados para tratar durante la asamblea.</p>

            <div className="mt-4 space-y-4">
              {asamblea.ordenDia.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                  Todavia no hay puntos cargados.
                </p>
              ) : (
                asamblea.ordenDia.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                    {canOperate ? (
                      <form action={actualizarOrdenDia} className="space-y-3">
                        <input type="hidden" name="asambleaOrdenDiaId" value={item.id} />
                        <input type="hidden" name="asambleaId" value={asamblea.id} />
                        <input type="hidden" name="consorcioId" value={asamblea.consorcioId} />

                        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">Orden</label>
                            <input name="orden" type="number" min="1" defaultValue={item.orden} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">Titulo</label>
                            <input name="titulo" defaultValue={item.titulo} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-600">Descripcion</label>
                          <textarea name="descripcion" rows={3} defaultValue={item.descripcion ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                        </div>

                        <div className="flex gap-3">
                          <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                            Guardar punto
                          </button>
                          <button
                            formAction={eliminarOrdenDia}
                            type="submit"
                            className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.orden}. {item.titulo}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.descripcion ?? "Sin descripcion."}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {canOperate ? (
              <form action={agregarOrdenDia} className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <input type="hidden" name="id" value={asamblea.id} />
                <input type="hidden" name="consorcioId" value={asamblea.consorcioId} />

                <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                  <div className="space-y-1">
                    <label htmlFor="nuevo-orden" className="text-sm font-medium text-slate-700">Orden</label>
                    <input id="nuevo-orden" name="orden" type="number" min="1" defaultValue={asamblea.ordenDia.length + 1} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="nuevo-titulo" className="text-sm font-medium text-slate-700">Titulo</label>
                    <input id="nuevo-titulo" name="titulo" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="nueva-descripcion" className="text-sm font-medium text-slate-700">Descripcion</label>
                  <textarea id="nueva-descripcion" name="descripcion" rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Agregar punto
                </button>
              </form>
            ) : null}
          </article>
        </div>

        <div className="space-y-6">
          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Convocatoria</h2>
            <p className="mt-1 text-sm text-slate-500">Envio de convocatoria por mail a responsables vigentes y simulacion previa para revision interna.</p>

            {canOperate ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p><strong>Fecha:</strong> {formatDate(asamblea.fecha)}</p>
                  <p><strong>Hora:</strong> {asamblea.hora}</p>
                  <p><strong>Lugar:</strong> {asamblea.lugar}</p>
                  <p><strong>Puntos cargados:</strong> {asamblea.ordenDia.length}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <form action={enviarSimulacionConvocatoria}>
                    <input type="hidden" name="id" value={asamblea.id} />
                    <input type="hidden" name="consorcioId" value={asamblea.consorcioId} />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Enviar simulacion al administrador
                    </button>
                  </form>

                  <form action={enviarConvocatoria}>
                    <input type="hidden" name="id" value={asamblea.id} />
                    <input type="hidden" name="consorcioId" value={asamblea.consorcioId} />
                    <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      Enviar convocatoria
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                Tenes acceso de lectura. El envio de convocatorias esta disponible para administradores u operadores.
              </p>
            )}
          </article>

          <article id="acta" className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Acta</h2>
            <p className="mt-1 text-sm text-slate-500">Texto editable asociado a la asamblea.</p>

            {canOperate ? (
              <form action={guardarActa} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={asamblea.id} />
                <input type="hidden" name="consorcioId" value={asamblea.consorcioId} />

                <textarea
                  name="actaTexto"
                  rows={14}
                  defaultValue={asamblea.actaTexto ?? ""}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />

                <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Guardar acta
                </button>
              </form>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 whitespace-pre-wrap">
                {asamblea.actaTexto ?? "Todavia no hay acta cargada."}
              </div>
            )}
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Historial de envios</h2>
            <p className="mt-1 text-sm text-slate-500">Trazabilidad de correos de convocatoria asociados a esta asamblea.</p>

            <div className="mt-4 space-y-3">
              {asamblea.enviosEmail.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                  Todavia no hay emails enviados para esta asamblea.
                </p>
              ) : (
                asamblea.enviosEmail.map((envio) => (
                  <div key={envio.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{envio.asunto}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {envio.unidad ? `${envio.unidad.identificador} (${envio.unidad.tipo})` : "Sin unidad"} -{" "}
                          {envio.destinatario ?? "Sin destinatario"}
                        </p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                          {tipoEnvioLabel(envio.tipoEnvio)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          envio.estado === "ENVIADO"
                            ? "bg-emerald-100 text-emerald-800"
                            : envio.estado === "ERROR"
                              ? "bg-red-100 text-red-700"
                              : envio.estado === "SIN_DESTINATARIO"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {envio.estado}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(envio.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
