"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type DeudaRow = {
  expensaId: number;
  unidad: string;
  propietario: string;
  mesCierre: string;
  mesVencimiento: string;
  capital: number;
  interes: number;
};

type Criterio = "TOTAL" | "CAPITAL" | "INTERES" | "PARCIAL";

type Props = {
  liquidacionId: number;
  fechaLiquidacionDeudas: string;
  deudas: DeudaRow[];
  action: (formData: FormData) => void;
  deshacerAction: (formData: FormData) => void;
  volverHref: string;
};

function currency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function LiquidacionPaso2Form({
  liquidacionId,
  fechaLiquidacionDeudas,
  deudas,
  action,
  deshacerAction,
  volverHref,
}: Props) {
  const [fecha, setFecha] = useState(fechaLiquidacionDeudas);
  const [selected, setSelected] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    for (const deuda of deudas) {
      initial[deuda.expensaId] = true;
    }
    return initial;
  });

  const [criterios, setCriterios] = useState<Record<number, Criterio>>(() => {
    const initial: Record<number, Criterio> = {};
    for (const deuda of deudas) {
      initial[deuda.expensaId] = "TOTAL";
    }
    return initial;
  });

  const [parciales, setParciales] = useState<Record<number, string>>({});

  const allSelected = deudas.length > 0 && deudas.every((d) => selected[d.expensaId]);
  const selectedCount = deudas.filter((d) => selected[d.expensaId]).length;

  const totals = useMemo(() => {
    let totalCapital = 0;
    let totalLiquidar = 0;

    for (const deuda of deudas) {
      if (!selected[deuda.expensaId]) continue;

      totalCapital += deuda.capital;

      const criterio = criterios[deuda.expensaId] ?? "TOTAL";
      if (criterio === "TOTAL") {
        totalLiquidar += deuda.capital + deuda.interes;
      } else if (criterio === "CAPITAL") {
        totalLiquidar += deuda.capital;
      } else if (criterio === "INTERES") {
        totalLiquidar += deuda.interes;
      } else {
        const parcial = Number(parciales[deuda.expensaId] ?? 0);
        if (!Number.isNaN(parcial) && parcial > 0) {
          totalLiquidar += parcial;
        }
      }
    }

    return {
      totalCapital,
      totalLiquidar,
    };
  }, [criterios, deudas, parciales, selected]);

  return (
    <>
      <form method="GET" className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="fechaLiquidacionDeudas" className="mb-1 block text-sm font-medium text-slate-700">
              Fecha liquidacion de deudas
            </label>
            <input
              id="fechaLiquidacionDeudas"
              type="date"
              name="fechaLiquidacionDeudas"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Recalcular intereses
          </button>
        </div>
      </form>

      <form action={action} className="rounded-xl border border-slate-200 bg-white">
        <input type="hidden" name="liquidacionId" value={liquidacionId} />
        <input type="hidden" name="fechaCalculoInteres" value={fecha} />

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-sm text-slate-600">
                <th className="px-4 py-3 font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => {
                      const next: Record<number, boolean> = {};
                      for (const deuda of deudas) {
                        next[deuda.expensaId] = e.target.checked;
                      }
                      setSelected(next);
                    }}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Unidad funcional</th>
                <th className="px-4 py-3 font-medium">Responsable</th>
                <th className="px-4 py-3 font-medium">Mes cierre</th>
                <th className="px-4 py-3 font-medium">Mes vencimiento</th>
                <th className="px-4 py-3 font-medium">Deuda (capital)</th>
                <th className="px-4 py-3 font-medium">Interes calculado</th>
                <th className="px-4 py-3 font-medium">Criterio de imputacion</th>
                <th className="px-4 py-3 font-medium">Importe final</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800">
              {deudas.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={9} className="px-4 py-4 text-slate-500">
                    No hay deudas pendientes para incluir en esta liquidacion. Podes continuar al siguiente paso.
                  </td>
                </tr>
              ) : (
                deudas.map((deuda) => {
                  const criterio = criterios[deuda.expensaId] ?? "TOTAL";
                  const parcialValue = parciales[deuda.expensaId] ?? "";
                  const total = deuda.capital + deuda.interes;
                  const parcialNumber = Number(parcialValue || 0);

                  const importeFinal =
                    criterio === "TOTAL"
                      ? total
                      : criterio === "CAPITAL"
                        ? deuda.capital
                        : criterio === "INTERES"
                          ? deuda.interes
                          : parcialNumber;

                  const parcialInvalido = criterio === "PARCIAL" && (parcialNumber <= 0 || parcialNumber > total);

                  return (
                    <tr key={deuda.expensaId} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[deuda.expensaId])}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [deuda.expensaId]: e.target.checked,
                            }))
                          }
                        />
                        {selected[deuda.expensaId] ? (
                          <input type="hidden" name="selectedExpensaIds" value={deuda.expensaId} />
                        ) : null}
                      </td>
                      <td className="px-4 py-4">{deuda.unidad}</td>
                      <td className="px-4 py-4">{deuda.propietario}</td>
                      <td className="px-4 py-4">{deuda.mesCierre}</td>
                      <td className="px-4 py-4">{deuda.mesVencimiento}</td>
                      <td className="px-4 py-4">{currency(deuda.capital)}</td>
                      <td className="px-4 py-4">{currency(deuda.interes)}</td>
                      <td className="px-4 py-4">
                        <select
                          value={criterio}
                          onChange={(e) =>
                            setCriterios((prev) => ({
                              ...prev,
                              [deuda.expensaId]: e.target.value as Criterio,
                            }))
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1"
                        >
                          <option value="TOTAL">TOTAL</option>
                          <option value="CAPITAL">SOLO CAPITAL</option>
                          <option value="INTERES">SOLO INTERESES</option>
                          <option value="PARCIAL">PARCIAL</option>
                        </select>
                        <input type="hidden" name={`criterio_${deuda.expensaId}`} value={criterio} />
                        {criterio === "PARCIAL" ? (
                          <div className="mt-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={parcialValue}
                              onChange={(e) =>
                                setParciales((prev) => ({
                                  ...prev,
                                  [deuda.expensaId]: e.target.value,
                                }))
                              }
                              className="w-full rounded-md border border-slate-300 px-2 py-1"
                              placeholder="Importe"
                            />
                            {parcialInvalido ? (
                              <p className="mt-1 text-xs text-red-600">Debe ser mayor a 0 y menor o igual al total.</p>
                            ) : null}
                          </div>
                        ) : null}
                        <input type="hidden" name={`parcial_${deuda.expensaId}`} value={parcialValue} />
                      </td>
                      <td className="px-4 py-4">{currency(Math.max(0, Number.isNaN(importeFinal) ? 0 : importeFinal))}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 p-4">
          {deudas.length > 0 && selectedCount === 0 ? (
            <p className="mb-3 text-sm text-slate-600">No se incorporaran deudas anteriores en esta liquidacion.</p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total sin intereses</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{currency(totals.totalCapital)}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total a liquidar</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{currency(totals.totalLiquidar)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={volverHref}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Volver
            </Link>

            <button
              type="submit"
              formAction={deshacerAction}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Deshacer liquidacion
            </button>

            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Liquidar deudas y continuar
            </button>
          </div>
        </div>
      </form>
    </>
  );
}


