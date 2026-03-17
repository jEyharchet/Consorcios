"use client";

import { useMemo, useState } from "react";

import { ASAMBLEA_TIPO } from "@/lib/administracion-shared";
import { buildAsambleaConvocatoriaPreviewHtml } from "@/lib/asamblea-convocatoria-preview";

type OrdenDiaDraft = {
  id: string;
  titulo: string;
};

type Props = {
  action: (formData: FormData) => void;
  consorcioId: number;
  consorcioNombre: string;
};

type AsambleaTipo = (typeof ASAMBLEA_TIPO)[keyof typeof ASAMBLEA_TIPO];

function createOrdenDiaDraft(index: number): OrdenDiaDraft {
  return {
    id: `orden-${index}-${Date.now()}`,
    titulo: "",
  };
}

export default function NuevaAsambleaEditor({ action, consorcioId, consorcioNombre }: Props) {
  const [tipo, setTipo] = useState<AsambleaTipo>(ASAMBLEA_TIPO.ORDINARIA);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [lugar, setLugar] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [ordenDelDia, setOrdenDelDia] = useState<OrdenDiaDraft[]>([
    createOrdenDiaDraft(1),
    createOrdenDiaDraft(2),
  ]);

  const previewHtml = useMemo(
    () =>
      buildAsambleaConvocatoriaPreviewHtml({
        consorcioNombre,
        tipo,
        fecha,
        hora,
        lugar,
        observaciones,
        ordenDelDia,
      }),
    [consorcioNombre, tipo, fecha, hora, lugar, observaciones, ordenDelDia],
  );

  function updateOrdenDia(id: string, value: string) {
    setOrdenDelDia((current) =>
      current.map((item) => (item.id === id ? { ...item, titulo: value } : item)),
    );
  }

  function addOrdenDia() {
    setOrdenDelDia((current) => [...current, createOrdenDiaDraft(current.length + 1)]);
  }

  function removeOrdenDia(id: string) {
    setOrdenDelDia((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="consorcioId" value={consorcioId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="tipo" className="text-sm font-medium text-slate-700">
              Tipo
            </label>
            <select
              id="tipo"
              name="tipo"
              value={tipo}
              onChange={(event) => setTipo(event.target.value as AsambleaTipo)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={ASAMBLEA_TIPO.ORDINARIA}>ORDINARIA</option>
              <option value={ASAMBLEA_TIPO.EXTRAORDINARIA}>EXTRAORDINARIA</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="lugar" className="text-sm font-medium text-slate-700">
              Lugar
            </label>
            <input
              id="lugar"
              name="lugar"
              value={lugar}
              onChange={(event) => setLugar(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="fecha" className="text-sm font-medium text-slate-700">
              Fecha
            </label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="hora" className="text-sm font-medium text-slate-700">
              Hora
            </label>
            <input
              id="hora"
              name="hora"
              type="time"
              value={hora}
              onChange={(event) => setHora(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Orden del dia</h2>
              <p className="mt-1 text-xs text-slate-500">Estos puntos se reflejan en la previsualizacion y se guardan al crear la asamblea.</p>
            </div>
            <button
              type="button"
              onClick={addOrdenDia}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
            >
              Agregar punto
            </button>
          </div>

          <div className="space-y-3">
            {ordenDelDia.map((item, index) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">Punto {index + 1}</p>
                  {ordenDelDia.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeOrdenDia(item.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Titulo</label>
                    <input
                      value={item.titulo}
                      onChange={(event) => updateOrdenDia(item.id, event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <input type="hidden" name="ordenTitulo" value={item.titulo} />
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-1">
          <label htmlFor="observaciones" className="text-sm font-medium text-slate-700">
            Observaciones
          </label>
          <textarea
            id="observaciones"
            name="observaciones"
            rows={4}
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Crear asamblea
        </button>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Previsualizacion del documento</h2>
            <p className="mt-1 text-sm text-slate-500">Vista en vivo del HTML base que luego podra reutilizarse para generar el PDF.</p>
          </div>
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-auto bg-slate-100 p-4">
          <div className="flex justify-center">
            <div className="aspect-[210/297] w-full max-w-[860px] rounded-xl border border-slate-300 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.12)]">
              <div
                className="h-full overflow-hidden rounded-xl"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
