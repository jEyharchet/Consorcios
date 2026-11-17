import Link from "next/link";
import { notFound } from "next/navigation";

import { simularCierreEjercicio, type Inconsistencia } from "../../../../../lib/cierre-simulacion";
import { getActiveConsorcioContext } from "../../../../../lib/consorcio-activo";
import { formatFechaCalendarioAR } from "../../../../../lib/ejercicios";
import { redirectToOnboardingIfNoConsorcios } from "../../../../../lib/onboarding";
import { formatDateTime } from "../../../shared";
import { ESTADO_APERTURA_LABEL } from "../../shared";

export const dynamic = "force-dynamic";

const moneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

function $(valor: number | null | undefined) {
  return valor === null || valor === undefined ? "—" : moneda.format(valor);
}

function mesLabel(mes: string) {
  const [anio, m] = mes.split("-");
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[Number(m) - 1]} ${anio}`;
}

const GRAVEDAD_ESTILO: Record<Inconsistencia["gravedad"], { badge: string; borde: string; label: string }> = {
  ALTA: { badge: "bg-red-50 text-red-700", borde: "border-red-200", label: "Revisar" },
  MEDIA: { badge: "bg-amber-50 text-amber-800", borde: "border-amber-200", label: "Verificar" },
  INFO: { badge: "bg-slate-100 text-slate-600", borde: "border-slate-200", label: "Informativo" },
};

const th = "py-2 pr-4 font-medium";
const thNum = "py-2 pl-4 text-right font-medium";
const td = "py-2.5 pr-4 text-slate-700";
const tdNum = "py-2.5 pl-4 text-right tabular-nums text-slate-700";

export default async function SimulacionCierrePage({ params }: { params: { id: string } }) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  const ejercicioId = Number(params.id);
  if (!activeConsorcioId || !Number.isInteger(ejercicioId) || ejercicioId <= 0) notFound();

  const s = await simularCierreEjercicio(ejercicioId, activeConsorcioId);
  if (!s) notFound();

  const { ejercicio } = s;
  const revisar = s.inconsistencias.filter((i) => i.gravedad === "ALTA").length;
  const verificar = s.inconsistencias.filter((i) => i.gravedad === "MEDIA").length;
  const cobrado = s.totales.cobranzasCapital + s.totales.cobranzasInteres;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Simulación del cierre · Ejercicio N.º {ejercicio.numero}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {formatFechaCalendarioAR(ejercicio.fechaInicio)} – {formatFechaCalendarioAR(ejercicio.fechaFin)} ·{" "}
            {s.consorcio?.nombre}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Calculada el {formatDateTime(s.generadoAt)} con los datos actuales. Se puede repetir: no modifica saldos,
            expensas ni liquidaciones.
          </p>
        </div>

        <Link
          href={`/administracion/ejercicios/${ejercicio.id}`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver ejercicio
        </Link>
      </header>

      <div className="mb-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Borrador de trabajo para preparar la rendición. No son estados contables certificados ni reemplazan la
        revisión documental y profesional.
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Caja y bancos al cierre</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{$(s.fondosFinal)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Apertura: {ESTADO_APERTURA_LABEL[ejercicio.aperturaEstado] ?? ejercicio.aperturaEstado}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Cobrado en el ejercicio</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{$(cobrado)}</p>
          <p className="mt-1 text-xs text-slate-500">Incluye {$(s.totales.cobranzasInteres)} de intereses</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Pagado en el ejercicio</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{$(s.totales.egresos)}</p>
          <p className="mt-1 text-xs text-slate-500">Gastos devengados: {$(s.gastosDevengados)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Observaciones</p>
          <p className={`mt-2 text-lg font-semibold ${revisar > 0 ? "text-red-700" : "text-slate-950"}`}>
            {revisar} para revisar
          </p>
          <p className="mt-1 text-xs text-slate-500">{verificar} para verificar</p>
        </article>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Observaciones</h2>
        <p className="mt-1 text-sm text-slate-500">
          Faltantes e inconsistencias detectados. Resolverlos (o dejarlos explicados) antes de confirmar el cierre.
        </p>

        {s.inconsistencias.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No se detectaron observaciones.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {s.inconsistencias.map((inc) => {
              const estilo = GRAVEDAD_ESTILO[inc.gravedad];
              return (
                <details key={inc.codigo} className={`rounded-xl border ${estilo.borde} px-4 py-3`}>
                  <summary className="flex cursor-pointer list-none items-start gap-3">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${estilo.badge}`}>
                      {estilo.label}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-slate-900">
                        {inc.titulo}
                        {inc.items.length > 0 ? <span className="ml-2 text-slate-400">({inc.items.length})</span> : null}
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">{inc.detalle}</span>
                    </span>
                  </summary>
                  {inc.items.length > 0 ? (
                    <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
                      {inc.items.map((item, idx) => (
                        <li key={`${inc.codigo}-${idx}`} className="flex items-center justify-between gap-4 py-2">
                          {item.href ? (
                            <Link href={item.href} className="text-slate-700 underline-offset-2 hover:underline">
                              {item.texto}
                            </Link>
                          ) : (
                            <span className="text-slate-700">{item.texto}</span>
                          )}
                          {item.monto !== undefined ? (
                            <span className="shrink-0 tabular-nums text-slate-600">{$(item.monto)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Caja y bancos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Saldo inicial más los movimientos del ejercicio, comparado con el saldo que registra el sistema al cierre.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className={th}>Cuenta</th>
                <th className={thNum}>Inicial</th>
                <th className={thNum}>Cobranzas</th>
                <th className={thNum}>Pagos</th>
                <th className={thNum}>Ajustes</th>
                <th className={thNum}>Final calculado</th>
                <th className={thNum}>Según registros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.fondos.map((f) => {
                const difiere = f.finalCalculado !== null && Math.abs(f.finalCalculado - f.saldoSegunRegistros) > 0.005;
                return (
                  <tr key={f.clave}>
                    <td className={td}>
                      {f.nombre}
                      {!f.activa ? <span className="ml-2 text-xs text-slate-400">(inactiva)</span> : null}
                    </td>
                    <td className={tdNum}>{$(f.inicial)}</td>
                    <td className={tdNum}>{$(f.cobranzas)}</td>
                    <td className={tdNum}>{$(f.pagos)}</td>
                    <td className={tdNum}>{$(f.ajustes)}</td>
                    <td className={`${tdNum} font-semibold text-slate-900`}>{$(f.finalCalculado)}</td>
                    <td className={`${tdNum} ${difiere ? "font-semibold text-red-700" : ""}`}>{$(f.saldoSegunRegistros)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Ingresos y egresos por mes</h2>
        <p className="mt-1 text-sm text-slate-500">
          Lo efectivamente cobrado y pagado, por fecha de pago. Los ajustes manuales se muestran aparte: no son ingresos
          ni egresos.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className={th}>Mes</th>
                <th className={thNum}>Cobranzas</th>
                <th className={thNum}>Intereses</th>
                <th className={thNum}>Pagos de gastos</th>
                <th className={thNum}>Resultado</th>
                <th className={thNum}>Ajustes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.porMes.map((m) => {
                const resultado = m.cobranzasCapital + m.cobranzasInteres - m.egresos;
                const vacio = m.cobranzasCapital === 0 && m.cobranzasInteres === 0 && m.egresos === 0 && m.ajustes === 0;
                return (
                  <tr key={m.mes} className={vacio ? "text-slate-400" : undefined}>
                    <td className={td}>{mesLabel(m.mes)}</td>
                    <td className={tdNum}>{$(m.cobranzasCapital)}</td>
                    <td className={tdNum}>{$(m.cobranzasInteres)}</td>
                    <td className={tdNum}>{$(m.egresos)}</td>
                    <td className={`${tdNum} ${resultado < 0 ? "text-red-700" : ""}`}>{$(resultado)}</td>
                    <td className={tdNum}>{m.ajustes === 0 ? "—" : $(m.ajustes)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <tr>
                <td className="py-2.5 pr-4">Total</td>
                <td className={tdNum}>{$(s.totales.cobranzasCapital)}</td>
                <td className={tdNum}>{$(s.totales.cobranzasInteres)}</td>
                <td className={tdNum}>{$(s.totales.egresos)}</td>
                <td className={tdNum}>{$(cobrado - s.totales.egresos)}</td>
                <td className={tdNum}>{$(s.totales.ajustes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Gastos del ejercicio por rubro</h2>
        <p className="mt-1 text-sm text-slate-500">
          Gastos con período entre {mesLabel(s.periodoDesde)} y {mesLabel(s.periodoHasta)}, y lo pagado de ellos hasta el
          cierre.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className={th}>Tipo</th>
                <th className={th}>Rubro</th>
                <th className={thNum}>Gastos</th>
                <th className={thNum}>Devengado</th>
                <th className={thNum}>Pagado</th>
                <th className={thNum}>Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.gastosPorRubro.map((r) => (
                <tr key={`${r.tipoExpensa}-${r.rubro}`}>
                  <td className={td}>{r.tipoExpensa === "EXTRAORDINARIA" ? "Extraordinaria" : "Ordinaria"}</td>
                  <td className={td}>{r.rubro}</td>
                  <td className={tdNum}>{r.cantidad}</td>
                  <td className={tdNum}>{$(r.devengado)}</td>
                  <td className={tdNum}>{$(r.pagado)}</td>
                  <td className={`${tdNum} ${r.pendiente > 0 ? "text-amber-700" : ""}`}>{$(r.pendiente)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <tr>
                <td className="py-2.5 pr-4" colSpan={3}>
                  Total
                </td>
                <td className={tdNum}>{$(s.gastosDevengados)}</td>
                <td className={tdNum}>{$(s.gastosPorRubro.reduce((a, r) => a + r.pagado, 0))}</td>
                <td className={tdNum}>{$(s.gastosPorRubro.reduce((a, r) => a + r.pendiente, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Liquidaciones del ejercicio</h2>
        <p className="mt-1 text-sm text-slate-500">
          Lo emitido a las unidades, separando los cargos nuevos de la deuda de meses anteriores que se volvió a incluir.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className={th}>Período</th>
                <th className={thNum}>Ordinarias</th>
                <th className={thNum}>Extraordinarias</th>
                <th className={thNum}>Fondo de reserva</th>
                <th className={thNum}>Deuda trasladada</th>
                <th className={thNum}>Total emitido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.liquidaciones.map((l) => (
                <tr key={l.id}>
                  <td className={td}>
                    <Link href={`/liquidaciones/${l.id}`} className="underline-offset-2 hover:underline">
                      {mesLabel(l.periodo)}
                    </Link>
                    {l.estado !== "FINALIZADA" && l.estado !== "CERRADA" ? (
                      <span className="ml-2 text-xs text-red-700">{l.estado}</span>
                    ) : null}
                  </td>
                  <td className={tdNum}>{$(l.ordinarias)}</td>
                  <td className={tdNum}>{$(l.extraordinarias)}</td>
                  <td className={tdNum}>{$(l.fondoReserva)}</td>
                  <td className={tdNum}>{l.deudaTrasladada === 0 ? "—" : $(l.deudaTrasladada)}</td>
                  <td className={`${tdNum} font-medium text-slate-900`}>{$(l.emitido)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <tr>
                <td className="py-2.5 pr-4">Total</td>
                <td className={tdNum}>{$(s.liquidaciones.reduce((a, l) => a + l.ordinarias, 0))}</td>
                <td className={tdNum}>{$(s.liquidaciones.reduce((a, l) => a + l.extraordinarias, 0))}</td>
                <td className={tdNum}>{$(s.fondoReservaLiquidado)}</td>
                <td className={tdNum}>{$(s.deudaTrasladadaTotal)}</td>
                <td className={tdNum}>{$(s.emitidoTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Cargos nuevos del ejercicio: {$(s.cargosNuevosTotal)}. El fondo de reserva liquidado no se identifica todavía
          por separado en lo cobrado ni en sus aplicaciones.
        </p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Créditos por unidad al cierre</h2>
          <p className="mt-1 text-sm text-slate-500">
            Capital de expensas pendiente al {formatFechaCalendarioAR(ejercicio.fechaFin)}, contando una sola vez la
            deuda trasladada. No incluye intereses no liquidados.
          </p>
          {s.creditos.length === 0 ? (
            <p className="mt-5 text-sm text-slate-500">Sin créditos pendientes.</p>
          ) : (
            <table className="mt-5 w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {s.creditos.map((c) => (
                  <tr key={c.unidad}>
                    <td className={td}>{c.unidad}</td>
                    <td className="py-2.5 text-xs text-slate-400">
                      {c.expensas} {c.expensas === 1 ? "expensa" : "expensas"}
                    </td>
                    <td className={tdNum}>{$(c.capital)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-semibold text-slate-900">
                <tr>
                  <td className="py-2.5 pr-4" colSpan={2}>
                    Total
                  </td>
                  <td className={tdNum}>{$(s.creditosTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Deudas con proveedores al cierre</h2>
          <p className="mt-1 text-sm text-slate-500">
            Gastos con período hasta {mesLabel(s.periodoHasta)} que no estaban pagados al cierre.
          </p>
          {s.deudasProveedores.length === 0 ? (
            <p className="mt-5 text-sm text-slate-500">Sin deudas pendientes.</p>
          ) : (
            <table className="mt-5 w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {s.deudasProveedores.map((d) => (
                  <tr key={d.id}>
                    <td className={td}>
                      <Link href={`/gastos/${d.id}`} className="underline-offset-2 hover:underline">
                        {d.concepto}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {d.periodo}
                        {d.proveedor ? ` · ${d.proveedor}` : ""}
                      </span>
                    </td>
                    <td className={tdNum}>{$(d.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-semibold text-slate-900">
                <tr>
                  <td className="py-2.5 pr-4">Total</td>
                  <td className={tdNum}>{$(s.deudaProveedoresTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        <h2 className="text-base font-semibold text-slate-700">Criterios</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Cobros, pagos y movimientos de fondos: por fecha efectiva dentro del ejercicio.</li>
          <li>Gastos y liquidaciones: por período (mes) dentro del ejercicio, aunque se hayan emitido después del cierre.</li>
          <li>Saldo «según registros»: el que dejó el último movimiento cargado con fecha hasta el cierre.</li>
          <li>Lo que no se puede determinar se muestra como «—» o como observación; nunca se toma como cero.</li>
        </ul>
      </section>
    </main>
  );
}
