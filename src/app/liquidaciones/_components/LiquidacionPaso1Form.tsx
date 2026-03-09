"use client";

import { useMemo, useState } from "react";

type Props = {
  mesRendicionLabel: string;
  mesVencimientoLabel: string;
  mesRendicionValue: string;
  mesVencimientoValue: string;
  initialFondoReserva: number;
  initialOrdinarias: number;
  initialExtraordinarias: number;
  initialFechaVencimiento: string;
  initialTasaInteres: string;
  previousFondoReserva: number | null;
  previousTasaInteres: number | null;
  gestionGastosHref: string;
  submitLabel: string;
  action: (formData: FormData) => void;
};

function toFixedInput(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export default function LiquidacionPaso1Form({
  mesRendicionLabel,
  mesVencimientoLabel,
  mesRendicionValue,
  mesVencimientoValue,
  initialFondoReserva,
  initialOrdinarias,
  initialExtraordinarias,
  initialFechaVencimiento,
  initialTasaInteres,
  previousFondoReserva,
  previousTasaInteres,
  gestionGastosHref,
  submitLabel,
  action,
}: Props) {
  const [montoFondoReserva, setMontoFondoReserva] = useState(toFixedInput(initialFondoReserva));
  const [montoOrdinarias, setMontoOrdinarias] = useState(toFixedInput(initialOrdinarias));
  const [montoExtraordinarias, setMontoExtraordinarias] = useState(toFixedInput(initialExtraordinarias));
  const [fechaVencimiento, setFechaVencimiento] = useState(initialFechaVencimiento);
  const [tasaInteresMensual, setTasaInteresMensual] = useState(initialTasaInteres);

  const total = useMemo(() => {
    const fondo = Number(montoFondoReserva) || 0;
    const ord = Number(montoOrdinarias) || 0;
    const ext = Number(montoExtraordinarias) || 0;
    return fondo + ord + ext;
  }, [montoFondoReserva, montoOrdinarias, montoExtraordinarias]);

  const canLoadPrevious = previousFondoReserva !== null || previousTasaInteres !== null;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="mesRendicion" value={mesRendicionValue} />
      <input type="hidden" name="mesVencimiento" value={mesVencimientoValue} />

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mes de rendicion (cierre)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{mesRendicionLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mes de vencimiento de expensas</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{mesVencimientoLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total a liquidar</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">${total.toFixed(2)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fondo de reserva</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!canLoadPrevious) return;
                if (previousFondoReserva !== null) setMontoFondoReserva(toFixedInput(previousFondoReserva));
                if (previousTasaInteres !== null) setTasaInteresMensual(String(previousTasaInteres));
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canLoadPrevious}
            >
              Traer valores del mes anterior
            </button>
            <button
              type="button"
              onClick={() => {
                setMontoFondoReserva("0.00");
                setTasaInteresMensual("");
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Limpiar valores
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="montoFondoReserva">
              Monto a cobrar por fondo de reserva
            </label>
            <input
              id="montoFondoReserva"
              name="montoFondoReserva"
              type="number"
              step="0.01"
              min="0"
              value={montoFondoReserva}
              onChange={(e) => setMontoFondoReserva(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-medium">Total fondo de reserva</p>
            <p className="mt-1 text-lg font-semibold">${(Number(montoFondoReserva) || 0).toFixed(2)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Expensas ordinarias y extraordinarias</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="montoOrdinarias">
              Gastos ordinarios
            </label>
            <input
              id="montoOrdinarias"
              name="montoOrdinarias"
              type="number"
              step="0.01"
              min="0"
              value={montoOrdinarias}
              onChange={(e) => setMontoOrdinarias(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="montoExtraordinarias">
              Gastos extraordinarios
            </label>
            <input
              id="montoExtraordinarias"
              name="montoExtraordinarias"
              type="number"
              step="0.01"
              min="0"
              value={montoExtraordinarias}
              onChange={(e) => setMontoExtraordinarias(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <a href={gestionGastosHref} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Ir a Gestion de Gastos del mes
        </a>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="fechaVencimiento">
              Fecha de vencimiento
            </label>
            <input
              id="fechaVencimiento"
              name="fechaVencimiento"
              type="date"
              required
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="tasaInteresMensual">
              Tasa de interes mensual (%)
            </label>
            <input
              id="tasaInteresMensual"
              name="tasaInteresMensual"
              type="number"
              step="0.01"
              min="0"
              value={tasaInteresMensual}
              onChange={(e) => setTasaInteresMensual(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-medium">Total a liquidar</p>
            <p className="mt-1 text-2xl font-semibold">${total.toFixed(2)}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {submitLabel}
          </button>
        </div>
      </section>
    </form>
  );
}
