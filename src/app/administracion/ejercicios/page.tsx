import Link from "next/link";
import { redirect } from "next/navigation";

import { requireConsorcioRole } from "../../../lib/auth";
import { getActiveConsorcioContext } from "../../../lib/consorcio-activo";
import {
  diasEntre,
  duracionEnDias,
  esPeriodoAnual,
  formatFechaCalendario,
  formatFechaCalendarioAR,
  hoyFechaCalendarioAR,
  sugerirSiguienteEjercicio,
} from "../../../lib/ejercicios";
import { crearEjercicio, listarEjercicios } from "../../../lib/ejercicios-data";
import { redirectToOnboardingIfNoConsorcios } from "../../../lib/onboarding";
import { prisma } from "../../../lib/prisma";
import { buildReturnQuery } from "../shared";
import {
  ESTADO_APERTURA_LABEL,
  ESTADO_EJERCICIO_LABEL,
  inputClassName,
  leerFormularioEjercicio,
  mensajesDesdeQuery,
} from "./shared";

export default async function EjerciciosPage({
  searchParams,
}: {
  searchParams?: { ok?: string; error?: string; aviso?: string };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administración - Ejercicios</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo válido para mostrar.
        </p>
      </main>
    );
  }

  const canOperate =
    access.isSuperAdmin ||
    access.assignments.some((a) => a.consorcioId === activeConsorcioId && a.role === "ADMIN");

  async function crear(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const accessAccion = await requireConsorcioRole(consorcioId, ["ADMIN"]);

    const leido = leerFormularioEjercicio(formData);
    if (!leido.ok) {
      redirect(`/administracion/ejercicios${buildReturnQuery({ error: leido.errores.join("|") })}`);
    }

    const resultado = await crearEjercicio(consorcioId, leido.datos, accessAccion.user.id);
    if (!resultado.ok) {
      redirect(`/administracion/ejercicios${buildReturnQuery({ error: resultado.errores.join("|") })}`);
    }

    redirect(
      `/administracion/ejercicios/${resultado.id}${buildReturnQuery({
        ok: "ejercicio_creado",
        aviso: resultado.advertencias.join("|"),
      })}`,
    );
  }

  const [consorcio, ejercicios] = await Promise.all([
    prisma.consorcio.findUnique({ where: { id: activeConsorcioId }, select: { id: true, nombre: true } }),
    listarEjercicios(activeConsorcioId),
  ]);

  if (!consorcio) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administración - Ejercicios</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontró el consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  const hoy = hoyFechaCalendarioAR();
  const vigente = ejercicios.find((e) => e.fechaInicio <= hoy && e.fechaFin >= hoy) ?? null;
  // Ejercicios terminados y todavía abiertos: el más antiguo es la próxima rendición.
  const rendicionPendiente =
    [...ejercicios].reverse().find((e) => e.estado === "ABIERTO" && e.fechaFin < hoy) ?? null;
  const aperturasPendientes = ejercicios.filter((e) => e.aperturaEstado === "PENDIENTE").length;

  const ultimo = ejercicios[0] ?? null;
  const sugerencia = ultimo ? sugerirSiguienteEjercicio(ultimo) : null;

  const errores = mensajesDesdeQuery(searchParams?.error);
  const diasRendicion = rendicionPendiente ? diasEntre(hoy, rendicionPendiente.vencimientoRendicion) : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administración - Ejercicios</h1>
          <p className="mt-1 text-sm text-slate-600">
            Períodos económicos del consorcio: base de la rendición anual de cuentas y del cierre de cada ejercicio.
          </p>
          <p className="mt-1 text-sm text-slate-500">Consorcio activo: {consorcio.nombre}</p>
        </div>

        <Link
          href="/administracion"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver módulo
        </Link>
      </header>

      {searchParams?.ok === "ejercicio_eliminado" ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          El ejercicio se eliminó correctamente.
        </div>
      ) : null}

      {errores.length > 0 ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ul className="list-disc space-y-1 pl-5">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!canOperate ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tenés acceso de consulta. Solo usuarios ADMIN pueden registrar o modificar ejercicios.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Ejercicio vigente</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{vigente ? `N.º ${vigente.numero}` : "Sin registrar"}</p>
          {vigente ? (
            <p className="mt-1 text-xs text-slate-500">Cierra el {formatFechaCalendarioAR(vigente.fechaFin)}</p>
          ) : null}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Próxima rendición</p>
          <p
            className={`mt-2 text-lg font-semibold ${
              diasRendicion !== null && diasRendicion < 0 ? "text-red-700" : "text-slate-950"
            }`}
          >
            {rendicionPendiente ? formatFechaCalendarioAR(rendicionPendiente.vencimientoRendicion) : "Sin pendientes"}
          </p>
          {rendicionPendiente && diasRendicion !== null ? (
            <p className="mt-1 text-xs text-slate-500">
              Ejercicio N.º {rendicionPendiente.numero} ·{" "}
              {diasRendicion >= 0 ? `faltan ${diasRendicion} días` : `vencida hace ${-diasRendicion} días`}
            </p>
          ) : null}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Ejercicios registrados</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{ejercicios.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Aperturas pendientes</p>
          <p className={`mt-2 text-lg font-semibold ${aperturasPendientes > 0 ? "text-amber-700" : "text-slate-950"}`}>
            {aperturasPendientes}
          </p>
        </article>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Ejercicios</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cada ejercicio empieza el día siguiente al cierre del anterior. Las fechas son inclusive.
        </p>

        {ejercicios.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            Todavía no hay ejercicios registrados para este consorcio.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">N.º</th>
                  <th className="py-2 pr-4 font-medium">Período</th>
                  <th className="py-2 pr-4 font-medium">Días</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 pr-4 font-medium">Apertura</th>
                  <th className="py-2 pr-4 font-medium">Rendición</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ejercicios.map((e) => {
                  const dias = duracionEnDias(e);
                  const irregular = !esPeriodoAnual(e);
                  return (
                    <tr key={e.id}>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{e.numero}</td>
                      <td className="py-3 pr-4 text-slate-700">
                        {formatFechaCalendarioAR(e.fechaInicio)} – {formatFechaCalendarioAR(e.fechaFin)}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {dias}
                        {irregular ? (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">irregular</span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            e.estado === "CERRADO" ? "bg-slate-900 text-white" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {ESTADO_EJERCICIO_LABEL[e.estado] ?? e.estado}
                        </span>
                      </td>
                      <td
                        className={`py-3 pr-4 ${e.aperturaEstado === "PENDIENTE" ? "text-amber-700" : "text-slate-700"}`}
                      >
                        {ESTADO_APERTURA_LABEL[e.aperturaEstado] ?? e.aperturaEstado}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{formatFechaCalendarioAR(e.vencimientoRendicion)}</td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/administracion/ejercicios/${e.id}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canOperate ? (
        <form action={crear} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <input type="hidden" name="consorcioId" value={consorcio.id} />
          <h2 className="text-lg font-semibold text-slate-900">
            {ultimo ? `Nuevo ejercicio (N.º ${ultimo.numero + 1})` : "Primer ejercicio"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {ultimo
              ? "Empieza el día siguiente al cierre del último ejercicio. Se sugiere un año; podés acortarlo o alargarlo si cambia la fecha de cierre, indicando el fundamento."
              : "Indicá las fechas reales del primer ejercicio. Si no dura un año (por ejemplo, desde la constitución del consorcio), indicá el fundamento."}
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div>
              <label htmlFor="fechaInicio" className="text-sm font-medium text-slate-700">
                Inicio
              </label>
              {sugerencia ? (
                <>
                  <input type="hidden" name="fechaInicio" value={formatFechaCalendario(sugerencia.fechaInicio)} />
                  <input
                    id="fechaInicio"
                    type="date"
                    disabled
                    value={formatFechaCalendario(sugerencia.fechaInicio)}
                    className={inputClassName()}
                  />
                </>
              ) : (
                <input id="fechaInicio" name="fechaInicio" type="date" required className={inputClassName()} />
              )}
            </div>
            <div>
              <label htmlFor="fechaFin" className="text-sm font-medium text-slate-700">
                Cierre
              </label>
              <input
                id="fechaFin"
                name="fechaFin"
                type="date"
                required
                defaultValue={sugerencia ? formatFechaCalendario(sugerencia.fechaFin) : undefined}
                className={inputClassName()}
              />
            </div>
            <div>
              <label htmlFor="vencimientoRendicion" className="text-sm font-medium text-slate-700">
                Vencimiento de la rendición
              </label>
              <input
                id="vencimientoRendicion"
                name="vencimientoRendicion"
                type="date"
                className={inputClassName()}
              />
              <p className="mt-1 text-xs text-slate-500">Vacío: cierre + 60 días (art. 2067 inc. e CCyC).</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="fundamento" className="text-sm font-medium text-slate-700">
                Fundamento
              </label>
              <textarea
                id="fundamento"
                name="fundamento"
                rows={3}
                placeholder="Ej.: Reglamento, art. 10 / Acta N.º 1 del 02/03/2026, punto 8"
                className={inputClassName()}
              />
            </div>
            <div>
              <label htmlFor="observaciones" className="text-sm font-medium text-slate-700">
                Observaciones
              </label>
              <textarea id="observaciones" name="observaciones" rows={3} className={inputClassName()} />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Registrar ejercicio
            </button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
