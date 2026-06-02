"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

import { formatDateAR } from "../../../lib/relaciones";
import {
  areUnidadRelacionPorcentajeTotalsValid,
  formatTipoRelacionUnidadLabel,
  TIPO_RELACION_UNIDAD,
} from "../../../lib/unidad-relacion";

type RelacionRow = {
  id: number;
  persona: {
    nombre: string;
    apellido: string;
    email: string | null;
    telefono: string | null;
  };
  tipoRelacion: string | null;
  porcentajeExpensasOrdinarias: number;
  porcentajeExpensasExtraordinarias: number;
  recibeLiquidacion: boolean;
  desde: string;
  hasta: string | null;
  vigente: boolean;
  inactiva: boolean;
};

type Props = {
  unidadId: number;
  relaciones: RelacionRow[];
  finalizarId?: number;
  errorMessage?: string | null;
  onSaveDistribucion: (formData: FormData) => void | Promise<void>;
  onRemovePersona: (formData: FormData) => void | Promise<void>;
  onFinalizarRelacion: (formData: FormData) => void | Promise<void>;
};

function formatPercentage(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

export default function UnidadRelacionesEditor({
  unidadId,
  relaciones,
  finalizarId,
  errorMessage,
  onSaveDistribucion,
  onRemovePersona,
  onFinalizarRelacion,
}: Props) {
  const [rows, setRows] = useState(relaciones);

  useEffect(() => {
    setRows(relaciones);
  }, [relaciones]);

  const activeRows = rows.filter((row) => row.vigente);
  const totals = activeRows.reduce(
    (acc, row) => ({
      ordinarias: acc.ordinarias + row.porcentajeExpensasOrdinarias,
      extraordinarias: acc.extraordinarias + row.porcentajeExpensasExtraordinarias,
    }),
    { ordinarias: 0, extraordinarias: 0 },
  );
  const totalsValid = areUnidadRelacionPorcentajeTotalsValid(totals);
  const payload = JSON.stringify(
    activeRows.map((row) => ({
      id: row.id,
      porcentajeExpensasOrdinarias: row.porcentajeExpensasOrdinarias,
      porcentajeExpensasExtraordinarias: row.porcentajeExpensasExtraordinarias,
      recibeLiquidacion: row.tipoRelacion === TIPO_RELACION_UNIDAD.INQUILINO ? row.recibeLiquidacion : false,
    })),
  );

  return (
    <div className="mt-2 w-[96%] rounded-lg border border-slate-200 bg-white">
      {errorMessage ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <form action={onSaveDistribucion} className="border-b border-slate-200 bg-slate-50 px-4 py-4">
        <input type="hidden" name="unidadId" value={unidadId} />
        <input type="hidden" name="payload" value={payload} />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1 text-sm">
            <p className={totalsValid ? "text-emerald-700" : "text-amber-700"}>
              Total ordinarias: {formatPercentage(totals.ordinarias)}% (debe ser 100%)
            </p>
            <p className={totalsValid ? "text-emerald-700" : "text-amber-700"}>
              Total extraordinarias: {formatPercentage(totals.extraordinarias)}% (debe ser 100%)
            </p>
          </div>

          <button
            type="submit"
            disabled={!totalsValid || activeRows.length === 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Guardar distribución
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-4 py-3 font-medium">Persona</th>
              <th className="px-4 py-3 font-medium">Relación</th>
              <th className="px-4 py-3 font-medium">% Expensas ordinarias</th>
              <th className="px-4 py-3 font-medium">% Expensas extraordinarias</th>
              <th className="px-4 py-3 font-medium">Recibe liquidación</th>
              <th className="px-4 py-3 font-medium">Vigencia</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-800">
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className={`border-t border-slate-100 ${row.inactiva ? "bg-slate-50 text-slate-500" : ""}`}>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">
                      {row.persona.apellido}, {row.persona.nombre}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.persona.email ?? "Sin email"} · {row.persona.telefono ?? "Sin teléfono"}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">{formatTipoRelacionUnidadLabel(row.tipoRelacion)}</td>
                  <td className="px-4 py-3 align-top">
                    {row.vigente ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.porcentajeExpensasOrdinarias}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    porcentajeExpensasOrdinarias: Number.isFinite(nextValue) ? nextValue : 0,
                                  }
                                : item,
                            ),
                          );
                        }}
                        className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    ) : (
                      formatPercentage(row.porcentajeExpensasOrdinarias)
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.vigente ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.porcentajeExpensasExtraordinarias}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    porcentajeExpensasExtraordinarias: Number.isFinite(nextValue) ? nextValue : 0,
                                  }
                                : item,
                            ),
                          );
                        }}
                        className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    ) : (
                      formatPercentage(row.porcentajeExpensasExtraordinarias)
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.tipoRelacion === TIPO_RELACION_UNIDAD.INQUILINO ? (
                      row.vigente ? (
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.recibeLiquidacion}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((item) =>
                                  item.id === row.id ? { ...item, recibeLiquidacion: event.target.checked } : item,
                                ),
                              )
                            }
                          />
                          Sí
                        </label>
                      ) : row.recibeLiquidacion ? (
                        "Sí"
                      ) : (
                        "No"
                      )
                    ) : (
                      <span className="text-slate-400">No aplica</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {formatDateAR(new Date(row.desde))} - {row.hasta ? formatDateAR(new Date(row.hasta)) : "Vigente"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-3">
                      <form action={onRemovePersona}>
                        <input type="hidden" name="unidadId" value={unidadId} />
                        <input type="hidden" name="relacionId" value={row.id} />
                        <button type="submit" className="text-red-600 hover:underline">
                          Desasociar
                        </button>
                      </form>

                      {row.vigente ? (
                        <Link href={`/unidades/${unidadId}?finalizar=${row.id}`} className="text-slate-700 hover:underline">
                          Finalizar
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>

                {row.vigente && finalizarId === row.id ? (
                  <tr className="border-t border-slate-100 bg-slate-50/40">
                    <td className="px-4 py-3" colSpan={7}>
                      <form action={onFinalizarRelacion} className="flex items-center gap-3">
                        <input type="hidden" name="unidadId" value={unidadId} />
                        <input type="hidden" name="relacionId" value={row.id} />
                        <input
                          type="date"
                          name="hasta"
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                        />
                        <button
                          type="submit"
                          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                          Guardar fin
                        </button>
                        <Link href={`/unidades/${unidadId}`} className="text-slate-700 hover:underline">
                          Cancelar
                        </Link>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
