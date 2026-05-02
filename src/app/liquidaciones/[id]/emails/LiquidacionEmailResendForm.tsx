"use client";

import { useMemo, useState } from "react";

import type { LiquidacionClosureDraft } from "@/lib/liquidacion-email";

type Props = {
  drafts: LiquidacionClosureDraft[];
  canOperate: boolean;
  action: (formData: FormData) => void;
  consorcioId: number;
  liquidacionId: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function LiquidacionEmailResendForm({
  drafts,
  canOperate,
  action,
  consorcioId,
  liquidacionId,
}: Props) {
  const [selected, setSelected] = useState<Record<number, boolean>>(
    Object.fromEntries(drafts.map((draft) => [draft.unidadId, draft.ultimoEstado !== "ENVIADO"])),
  );

  const totals = useMemo(() => {
    return drafts.reduce(
      (acc, draft) => {
        if (draft.ultimoEstado === "ERROR") acc.error += 1;
        else if (draft.ultimoEstado === "ENVIADO") acc.enviado += 1;
        else acc.sinEnvio += 1;
        return acc;
      },
      { enviado: 0, error: 0, sinEnvio: 0 },
    );
  }, [drafts]);

  function setSelectionBy(predicate: (draft: LiquidacionClosureDraft) => boolean) {
    setSelected(Object.fromEntries(drafts.map((draft) => [draft.unidadId, predicate(draft)])));
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="consorcioId" value={consorcioId} />
      <input type="hidden" name="liquidacionId" value={liquidacionId} />

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Enviados</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{totals.enviado}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Fallidos</p>
          <p className="mt-2 text-3xl font-semibold text-red-700">{totals.error}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Sin envío</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">{totals.sinEnvio}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectionBy((draft) => draft.ultimoEstado === "ERROR")}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Seleccionar fallidos
          </button>
          <button
            type="button"
            onClick={() => setSelectionBy((draft) => draft.ultimoEstado === "SIN_ENVIO" || draft.ultimoEstado === "SIN_DESTINATARIO")}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Seleccionar no enviados
          </button>
          <button
            type="button"
            onClick={() => setSelectionBy(() => true)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Seleccionar todos
          </button>
          <button
            type="button"
            onClick={() => setSelectionBy(() => false)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Limpiar selección
          </button>
        </div>
      </section>

      {drafts.map((draft) => (
        <article key={draft.unidadId} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <input type="hidden" name="draftUnitId" value={draft.unidadId} />
          <input type="hidden" name={`unidadIdsCsv_${draft.unidadId}`} value={draft.unidadIdsCsv} />
          <input type="hidden" name={`unidadCount_${draft.unidadId}`} value={draft.unidadCount} />
          <input type="hidden" name={`unidadLabel_${draft.unidadId}`} value={draft.unidadLabel} />
          <input type="hidden" name={`responsablesLabel_${draft.unidadId}`} value={draft.responsablesLabel} />
          <input type="hidden" name={`responsableIdsCsv_${draft.unidadId}`} value={draft.responsableIdsCsv} />
          <input type="hidden" name={`importeLiquidado_${draft.unidadId}`} value={draft.importeLiquidado} />
          <input type="hidden" name={`boletaArchivoId_${draft.unidadId}`} value={draft.boletaArchivoId ?? ""} />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{draft.unidadLabel}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  Importe {formatCurrency(draft.importeLiquidado)}
                </span>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    draft.ultimoEstado === "ENVIADO"
                      ? "bg-emerald-100 text-emerald-800"
                      : draft.ultimoEstado === "ERROR"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {draft.ultimoEstado}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">Responsables: {draft.responsablesLabel}</p>
              {draft.ultimoError ? <p className="mt-1 text-sm text-red-600">{draft.ultimoError}</p> : null}
            </div>

            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name={`enviar_${draft.unidadId}`}
                checked={selected[draft.unidadId] ?? false}
                onChange={(event) => setSelected((prev) => ({ ...prev, [draft.unidadId]: event.target.checked }))}
                disabled={!canOperate}
              />
              Enviar
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
                Mensaje
              </label>
              <textarea
                id={`cuerpo_${draft.unidadId}`}
                name={`cuerpo_${draft.unidadId}`}
                rows={8}
                defaultValue={draft.cuerpo}
                disabled={!canOperate}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </article>
      ))}

      {canOperate ? (
        <div className="flex justify-end">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Enviar seleccionados
          </button>
        </div>
      ) : null}
    </form>
  );
}
