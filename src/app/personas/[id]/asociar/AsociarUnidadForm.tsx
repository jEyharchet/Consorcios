"use client";

import { useState } from "react";

type ConsorcioOption = { id: number; nombre: string };
type UnidadOption = { id: number; identificador: string; tipo: string };

type Props = {
  personaLabel: string;
  consorcios: ConsorcioOption[];
  unidades: UnidadOption[];
  initial: { consorcioId: string; desde: string; hasta: string; confirmado: boolean };
  errorMessage?: string | null;
  onGuardar: (formData: FormData) => void | Promise<void>;
};

export default function AsociarUnidadForm({
  personaLabel,
  consorcios,
  unidades,
  initial,
  errorMessage,
  onGuardar,
}: Props) {
  const [consorcioId, setConsorcioId] = useState(initial.consorcioId);
  const [desde, setDesde] = useState(initial.desde);
  const [hasta, setHasta] = useState(initial.hasta);

  const dirty =
    consorcioId !== initial.consorcioId ||
    desde !== initial.desde ||
    hasta !== initial.hasta;

  const mostrarUnidad = !dirty && initial.confirmado && !!consorcioId && !!desde;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <p className="mb-4 text-slate-600">Persona: {personaLabel}</p>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <form method="get" className="space-y-4">
        <input type="hidden" name="confirmado" value="1" />

        <div className="space-y-1">
          <label htmlFor="consorcioId" className="text-sm font-medium text-slate-700">
            Consorcio
          </label>
          <select
            id="consorcioId"
            name="consorcioId"
            value={consorcioId}
            onChange={(e) => setConsorcioId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          >
            <option value="">Seleccionar consorcio</option>
            {consorcios.map((consorcio) => (
              <option key={consorcio.id} value={consorcio.id}>
                {consorcio.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="desde" className="text-sm font-medium text-slate-700">
              Desde
            </label>
            <input
              id="desde"
              name="desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="hasta" className="text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input
              id="hasta"
              name="hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Elegir
        </button>
      </form>

      {mostrarUnidad ? (
        unidades.length === 0 ? (
          <p className="mt-6 border-t border-slate-200 pt-6 text-sm text-slate-500">
            No hay unidades disponibles para esas fechas.
          </p>
        ) : (
          <form action={onGuardar} className="mt-6 space-y-4 border-t border-slate-200 pt-6">
            <input type="hidden" name="consorcioId" value={consorcioId} />
            <input type="hidden" name="desde" value={desde} />
            <input type="hidden" name="hasta" value={hasta} />
            <input type="hidden" name="confirmado" value="1" />

            <div className="space-y-1">
              <label htmlFor="unidadId" className="text-sm font-medium text-slate-700">
                Unidad
              </label>
              <select
                id="unidadId"
                name="unidadId"
                defaultValue=""
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              >
                <option value="">Seleccionar unidad</option>
                {unidades.map((unidad) => (
                  <option key={unidad.id} value={unidad.id}>
                    {unidad.identificador} ({unidad.tipo})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Guardar
            </button>
          </form>
        )
      ) : (
        <p className="mt-6 border-t border-slate-200 pt-6 text-sm text-slate-500">
          Presioná Elegir para actualizar unidades.
        </p>
      )}
    </section>
  );
}
