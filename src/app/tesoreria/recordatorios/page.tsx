import Link from "next/link";
import { redirect } from "next/navigation";

import { requireConsorcioAccess, requireConsorcioRole } from "../../../lib/auth";
import { buildReminderDrafts, sendReminderDrafts } from "../../../lib/liquidacion-email";
import { prisma } from "../../../lib/prisma";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildReturnQuery(values: Record<string, string | undefined | null>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function getFeedback(error?: string) {
  switch (error) {
    case "liquidacion_requerida":
      return "Debes seleccionar una liquidacion para previsualizar los recordatorios.";
    case "liquidacion_inexistente":
      return "No se encontro la liquidacion indicada.";
    case "sin_borradores_seleccionados":
      return "Debes dejar al menos un borrador seleccionado para enviar.";
    default:
      return null;
  }
}

export default async function RecordatoriosPreviewPage({
  searchParams,
}: {
  searchParams?: { liquidacionId?: string; error?: string };
}) {
  const liquidacionIdRaw = (searchParams?.liquidacionId ?? "").trim();
  const liquidacionId = /^\d+$/.test(liquidacionIdRaw) ? Number(liquidacionIdRaw) : null;

  if (!liquidacionId) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Preview de recordatorios</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          {getFeedback("liquidacion_requerida")}
        </p>
      </main>
    );
  }

  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    select: {
      id: true,
      consorcioId: true,
      periodo: true,
      estado: true,
      fechaVencimiento: true,
      consorcio: {
        select: {
          nombre: true,
        },
      },
    },
  });

  if (!liquidacion) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Preview de recordatorios</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          {getFeedback("liquidacion_inexistente")}
        </p>
      </main>
    );
  }

  const access = await requireConsorcioAccess(liquidacion.consorcioId);
  const canOperate =
    access.isSuperAdmin ||
    access.assignments.some(
      (assignment) =>
        assignment.consorcioId === liquidacion.consorcioId &&
        (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
    );

  const drafts = await buildReminderDrafts(liquidacionId);
  const feedback = getFeedback(searchParams?.error);

  async function confirmarEnvio(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const currentLiquidacionId = Number(formData.get("liquidacionId"));
    const draftIds = formData
      .getAll("draftUnitId")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    const selectedDrafts = draftIds
      .filter((unidadId) => formData.get(`enviar_${unidadId}`) === "on")
      .map((unidadId) => {
        const boletaArchivoIdRaw = (formData.get(`boletaArchivoId_${unidadId}`)?.toString() ?? "").trim();
        const boletaArchivoId = /^\d+$/.test(boletaArchivoIdRaw) ? Number(boletaArchivoIdRaw) : null;

        return {
          unidadId,
          destinatario: (formData.get(`destinatario_${unidadId}`)?.toString() ?? "").trim(),
          asunto: (formData.get(`asunto_${unidadId}`)?.toString() ?? "").trim(),
          cuerpo: (formData.get(`cuerpo_${unidadId}`)?.toString() ?? "").trim(),
          boletaArchivoId,
        };
      });

    if (selectedDrafts.length === 0) {
      redirect(
        `/tesoreria/recordatorios${buildReturnQuery({
          liquidacionId: String(currentLiquidacionId),
          error: "sin_borradores_seleccionados",
        })}`,
      );
    }

    const summary = await sendReminderDrafts({
      liquidacionId: currentLiquidacionId,
      drafts: selectedDrafts,
    });

    redirect(
      `/tesoreria${buildReturnQuery({
        ok: "recordatorios_ok",
        liquidacionId: String(currentLiquidacionId),
        enviados: String(summary.enviados),
        fallidos: String(summary.fallidos),
        sinDestinatario: String(summary.sinDestinatario),
      })}`,
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/tesoreria${buildReturnQuery({ liquidacionId: String(liquidacion.id) })}`} className="text-sm text-blue-600 hover:underline">
            Volver a Tesoreria
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">Preview de recordatorios</h1>
          <p className="mt-1 text-sm text-slate-600">
            Liquidacion {liquidacion.periodo} - {liquidacion.consorcio.nombre}
            {liquidacion.fechaVencimiento ? ` - vence ${liquidacion.fechaVencimiento.toLocaleDateString()}` : ""}
          </p>
        </div>
      </header>

      {feedback ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback}
        </div>
      ) : null}

      {!canOperate ? (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          Tenes acceso de lectura. La confirmacion de recordatorios esta disponible para administradores u operadores.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Unidades pendientes</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{drafts.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Con boleta adjunta</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {drafts.filter((draft) => draft.tieneBoletaAdjunta).length}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Sin destinatario sugerido</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {drafts.filter((draft) => !draft.destinatario).length}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Estado de liquidacion</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{liquidacion.estado}</p>
        </article>
      </section>

      {drafts.length === 0 ? (
        <section className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
          No hay unidades con saldo pendiente mayor a cero para esta liquidacion.
        </section>
      ) : (
        <form action={confirmarEnvio} className="mt-8 space-y-6">
          <input type="hidden" name="consorcioId" value={liquidacion.consorcioId} />
          <input type="hidden" name="liquidacionId" value={liquidacion.id} />

          {drafts.map((draft) => (
            <article key={draft.unidadId} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <input type="hidden" name="draftUnitId" value={draft.unidadId} />
              <input type="hidden" name={`boletaArchivoId_${draft.unidadId}`} value={draft.boletaArchivoId ?? ""} />

              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{draft.unidadLabel}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                      Saldo pendiente {formatCurrency(draft.saldoPendiente)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        draft.tieneBoletaAdjunta
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {draft.tieneBoletaAdjunta ? `Boleta adjunta: ${draft.boletaNombre}` : "Sin boleta adjunta"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Responsable sugerido: {draft.responsablesLabel}</p>
                </div>

                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" name={`enviar_${draft.unidadId}`} defaultChecked disabled={!canOperate} />
                  Incluir en envio
                </label>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="space-y-1">
                  <label htmlFor={`destinatario_${draft.unidadId}`} className="text-sm font-medium text-slate-700">
                    Destinatario
                  </label>
                  <input
                    id={`destinatario_${draft.unidadId}`}
                    name={`destinatario_${draft.unidadId}`}
                    defaultValue={draft.destinatario}
                    disabled={!canOperate}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor={`asunto_${draft.unidadId}`} className="text-sm font-medium text-slate-700">
                    Asunto
                  </label>
                  <input
                    id={`asunto_${draft.unidadId}`}
                    name={`asunto_${draft.unidadId}`}
                    defaultValue={draft.asunto}
                    disabled={!canOperate}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor={`cuerpo_${draft.unidadId}`} className="text-sm font-medium text-slate-700">
                    Cuerpo
                  </label>
                  <textarea
                    id={`cuerpo_${draft.unidadId}`}
                    name={`cuerpo_${draft.unidadId}`}
                    rows={10}
                    defaultValue={draft.cuerpo}
                    disabled={!canOperate}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </article>
          ))}

          {canOperate ? (
            <div className="flex items-center justify-end gap-3">
              <Link
                href={`/tesoreria${buildReturnQuery({ liquidacionId: String(liquidacion.id) })}`}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </Link>
              <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Confirmar envio
              </button>
            </div>
          ) : null}
        </form>
      )}
    </main>
  );
}
