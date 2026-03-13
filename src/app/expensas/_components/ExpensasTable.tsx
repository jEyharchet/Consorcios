import Link from "next/link";
import type { ReactNode } from "react";

import ExpensaEstadoBadge, { type ExpensaEstadoVisual } from "./ExpensaEstadoBadge";

export type ExpensaTableRow = {
  id: number;
  unidad: string;
  responsable: string;
  capital: string;
  saldo: string;
  estado: ExpensaEstadoVisual;
  canRegisterPayment: boolean;
};

type ExpensasTableProps = {
  rows: ExpensaTableRow[];
};

function MobileLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 md:hidden">{children}</span>;
}

export default function ExpensasTable({ rows }: ExpensasTableProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
      <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_140px_140px_130px_170px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 md:grid">
        <span>Unidad</span>
        <span>Responsable</span>
        <span className="text-right">Capital</span>
        <span className="text-right">Saldo</span>
        <span>Estado</span>
        <span className="text-right">Accion</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-900">No hay expensas para los filtros aplicados.</p>
          <p className="mt-2 text-sm text-slate-500">Proba con otro periodo, estado o termino de busqueda.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => {
            const actionHref = row.estado === "PAGADA" || !row.canRegisterPayment ? `/expensas/${row.id}` : `/expensas/${row.id}/pago`;
            const actionLabel = row.estado === "PAGADA" || !row.canRegisterPayment ? "Ver" : "Registrar pago";

            return (
              <div key={row.id} className="group relative">
                <Link
                  href={`/expensas/${row.id}`}
                  aria-label={`Abrir detalle de ${row.unidad}`}
                  className="absolute inset-0 rounded-none"
                />

                <div className="relative grid gap-4 px-5 py-4 transition-colors group-hover:bg-slate-50 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_140px_140px_130px_170px] md:items-center">
                  <div className="space-y-1">
                    <MobileLabel>Unidad</MobileLabel>
                    <p className="font-semibold text-slate-950">{row.unidad}</p>
                    <p className="text-sm text-slate-500">Expensa #{row.id}</p>
                  </div>

                  <div className="space-y-1">
                    <MobileLabel>Responsable</MobileLabel>
                    <p className="text-sm text-slate-700">{row.responsable}</p>
                  </div>

                  <div className="space-y-1 md:text-right">
                    <MobileLabel>Capital</MobileLabel>
                    <p className="text-sm font-medium text-slate-900">{row.capital}</p>
                  </div>

                  <div className="space-y-1 md:text-right">
                    <MobileLabel>Saldo</MobileLabel>
                    <p className="text-sm font-medium text-slate-900">{row.saldo}</p>
                  </div>

                  <div className="space-y-1">
                    <MobileLabel>Estado</MobileLabel>
                    <ExpensaEstadoBadge estado={row.estado} />
                  </div>

                  <div className="relative z-10 flex items-center md:justify-end">
                    <Link
                      href={actionHref}
                      className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      {actionLabel}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
