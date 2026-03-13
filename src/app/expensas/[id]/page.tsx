import Link from "next/link";

import { requireConsorcioAccess } from "../../../lib/auth";
import { buildPagoComprobantePath } from "../../../lib/comprobantes-pago";
import { formatUserLabel, getExpensaCobranzaSnapshot } from "../../../lib/cobranzas-expensas";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: Date) {
  return date.toLocaleDateString();
}

function badgeClass(estado: string) {
  if (estado === "PAGADA") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (estado === "PARCIAL") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-rose-100 text-rose-800";
}

export default async function ExpensaDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return <div className="p-6">Expensa no encontrada</div>;
  }

  const snapshot = await getExpensaCobranzaSnapshot(id, new Date());

  if (!snapshot) {
    return <div className="p-6">Expensa no encontrada</div>;
  }

  const access = await requireConsorcioAccess(snapshot.consorcio.id);
  const assignment = access.assignments.find((a) => a.consorcioId === snapshot.consorcio.id);
  const canRegisterPayment = access.isSuperAdmin || assignment?.role === "ADMIN";

  const resumen = [
    { label: "Consorcio", value: snapshot.consorcio.nombre },
    { label: "Liquidacion", value: snapshot.liquidacion.periodo },
    { label: "Unidad", value: `${snapshot.unidad.identificador} (${snapshot.unidad.tipo})` },
    { label: "Porcentaje de expensas", value: snapshot.unidad.porcentajeExpensas?.toString() ?? "-" },
    { label: "Capital original", value: formatCurrency(snapshot.capitalOriginal) },
    { label: "Capital pendiente", value: formatCurrency(snapshot.capitalPendiente) },
    { label: "Interes acumulado al dia", value: formatCurrency(snapshot.interesPendiente) },
    { label: "Total adeudado", value: formatCurrency(snapshot.totalAdeudado) },
    { label: "Total pagado", value: formatCurrency(snapshot.totalPagado) },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Link href="/expensas" className="text-blue-600 hover:underline">
            Volver
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Expensa #{snapshot.expensaId}</h1>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(snapshot.estado)}`}>
              {snapshot.estado}
            </span>
          </div>
          <p className="text-sm text-slate-500">Estado al {formatDate(snapshot.fechaCalculo)} con mora calculada a la fecha.</p>
        </div>

        {canRegisterPayment && snapshot.totalAdeudado > 0 ? (
          <Link
            href={`/expensas/${snapshot.expensaId}/pago`}
            className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Registrar cobranza
          </Link>
        ) : null}
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Resumen de deuda</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {resumen.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Composicion actual</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">Capital pendiente</span>
              <span className="font-medium text-slate-900">{formatCurrency(snapshot.capitalPendiente)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">Interes generado hasta hoy</span>
              <span className="font-medium text-slate-900">{formatCurrency(snapshot.interesPendiente)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">Pagado a capital</span>
              <span className="font-medium text-slate-900">{formatCurrency(snapshot.totalPagadoCapital)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">Pagado a interes</span>
              <span className="font-medium text-slate-900">{formatCurrency(snapshot.totalPagadoInteres)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <span className="text-slate-900">Total adeudado</span>
              <span className="text-slate-900">{formatCurrency(snapshot.totalAdeudado)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Historial de pagos</h2>
          <p className="text-sm text-slate-500">Cada pago deja trazada la imputacion a interes y capital.</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-left text-sm text-slate-600">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Monto total</th>
                  <th className="px-4 py-3 font-medium">A capital</th>
                  <th className="px-4 py-3 font-medium">A interes</th>
                  <th className="px-4 py-3 font-medium">Interes al cobro</th>
                  <th className="px-4 py-3 font-medium">Saldo luego</th>
                  <th className="px-4 py-3 font-medium">Medio</th>
                  <th className="px-4 py-3 font-medium">Referencia</th>
                  <th className="px-4 py-3 font-medium">Registrado por</th>
                  <th className="px-4 py-3 font-medium">Comprobante</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-800">
                {snapshot.pagos.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <td colSpan={10} className="px-4 py-4 text-slate-500">
                      Sin pagos registrados.
                    </td>
                  </tr>
                ) : (
                  snapshot.pagos
                    .slice()
                    .reverse()
                    .map((pago) => (
                      <tr key={pago.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-4 whitespace-nowrap">{formatDate(pago.fechaPago)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(pago.monto)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(pago.montoCapital ?? pago.monto)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(pago.montoInteres ?? 0)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(pago.interesDevengado ?? 0)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(pago.saldoResultante ?? 0)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{pago.medioPago}</td>
                        <td className="px-4 py-4">{pago.referencia ?? "-"}</td>
                        <td className="px-4 py-4">{formatUserLabel(pago.registradoPorUser)}</td>
                        <td className="px-4 py-4">
                          {pago.comprobanteNombreOriginal ? (
                            <Link href={buildPagoComprobantePath(pago.id)} className="text-blue-600 hover:underline">
                              Ver comprobante
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
