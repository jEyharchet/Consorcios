import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireConsorcioRole } from "../../../../lib/auth";
import { getActiveConsorcioContext } from "../../../../lib/consorcio-activo";
import {
  ESTADOS_APERTURA,
  type EstadoApertura,
  duracionEnDias,
  esPeriodoAnual,
  formatFechaCalendario,
  formatFechaCalendarioAR,
} from "../../../../lib/ejercicios";
import { actualizarEjercicio, eliminarEjercicio, registrarApertura } from "../../../../lib/ejercicios-data";
import { redirectToOnboardingIfNoConsorcios } from "../../../../lib/onboarding";
import { prisma } from "../../../../lib/prisma";
import { buildReturnQuery, formatDateTime } from "../../shared";
import {
  ESTADO_APERTURA_LABEL,
  ESTADO_EJERCICIO_LABEL,
  inputClassName,
  leerFormularioEjercicio,
  mensajesDesdeQuery,
} from "../shared";

const OK_MENSAJES: Record<string, string> = {
  ejercicio_creado: "El ejercicio se registró correctamente.",
  ejercicio_actualizado: "El período del ejercicio se actualizó correctamente.",
  apertura_registrada: "El estado de la apertura se registró correctamente.",
};

export default async function EjercicioDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { ok?: string; error?: string; aviso?: string };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  const ejercicioId = Number(params.id);
  if (!activeConsorcioId || !Number.isInteger(ejercicioId) || ejercicioId <= 0) notFound();

  const ejercicio = await prisma.ejercicio.findFirst({
    where: { id: ejercicioId, consorcioId: activeConsorcioId },
    include: { consorcio: { select: { id: true, nombre: true } } },
  });
  if (!ejercicio) notFound();

  const canOperate =
    access.isSuperAdmin ||
    access.assignments.some((a) => a.consorcioId === activeConsorcioId && a.role === "ADMIN");

  const ruta = `/administracion/ejercicios/${ejercicio.id}`;

  async function actualizar(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    await requireConsorcioRole(consorcioId, ["ADMIN"]);

    const leido = leerFormularioEjercicio(formData);
    if (!leido.ok) redirect(`${ruta}${buildReturnQuery({ error: leido.errores.join("|") })}`);

    const resultado = await actualizarEjercicio(consorcioId, ejercicioId, leido.datos);
    if (!resultado.ok) redirect(`${ruta}${buildReturnQuery({ error: resultado.errores.join("|") })}`);

    redirect(
      `${ruta}${buildReturnQuery({ ok: "ejercicio_actualizado", aviso: resultado.advertencias.join("|") })}`,
    );
  }

  async function apertura(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const accessAccion = await requireConsorcioRole(consorcioId, ["ADMIN"]);

    const estado = (formData.get("aperturaEstado")?.toString() ?? "") as EstadoApertura;
    const observaciones = (formData.get("aperturaObservaciones")?.toString() ?? "").trim() || null;

    const resultado = await registrarApertura(consorcioId, ejercicioId, estado, observaciones, accessAccion.user.id);
    if (!resultado.ok) redirect(`${ruta}${buildReturnQuery({ error: resultado.errores.join("|") })}`);

    redirect(`${ruta}${buildReturnQuery({ ok: "apertura_registrada" })}`);
  }

  async function eliminar(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    await requireConsorcioRole(consorcioId, ["ADMIN"]);

    if (formData.get("confirmacion")?.toString() !== "ELIMINAR") {
      redirect(`${ruta}${buildReturnQuery({ error: "Escribí ELIMINAR para confirmar." })}`);
    }

    const resultado = await eliminarEjercicio(consorcioId, ejercicioId);
    if (!resultado.ok) redirect(`${ruta}${buildReturnQuery({ error: resultado.errores.join("|") })}`);

    redirect(`/administracion/ejercicios${buildReturnQuery({ ok: "ejercicio_eliminado" })}`);
  }

  const [confirmadoPor, posterior] = await Promise.all([
    ejercicio.aperturaConfirmadaPorUserId
      ? prisma.user.findUnique({
          where: { id: ejercicio.aperturaConfirmadaPorUserId },
          select: { name: true, email: true },
        })
      : null,
    prisma.ejercicio.findFirst({
      where: { consorcioId: ejercicio.consorcioId, fechaInicio: { gt: ejercicio.fechaInicio } },
      select: { id: true },
    }),
  ]);

  const cerrado = ejercicio.estado === "CERRADO";
  const editable = canOperate && !cerrado;
  const eliminable = editable && !posterior;
  const dias = duracionEnDias(ejercicio);
  const irregular = !esPeriodoAnual(ejercicio);

  const errores = mensajesDesdeQuery(searchParams?.error);
  const avisos = mensajesDesdeQuery(searchParams?.aviso);
  const okTexto = searchParams?.ok ? OK_MENSAJES[searchParams.ok] : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ejercicio N.º {ejercicio.numero}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {formatFechaCalendarioAR(ejercicio.fechaInicio)} – {formatFechaCalendarioAR(ejercicio.fechaFin)}
          </p>
          <p className="mt-1 text-sm text-slate-500">Consorcio activo: {ejercicio.consorcio.nombre}</p>
        </div>

        <Link
          href="/administracion/ejercicios"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver ejercicios
        </Link>
      </header>

      {okTexto ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {okTexto}
        </div>
      ) : null}

      {avisos.length > 0 ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ul className="list-disc space-y-1 pl-5">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
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
          Tenés acceso de consulta. Solo usuarios ADMIN pueden modificar ejercicios.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Estado</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {ESTADO_EJERCICIO_LABEL[ejercicio.estado] ?? ejercicio.estado}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Duración</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{dias} días</p>
          <p className={`mt-1 text-xs ${irregular ? "text-amber-700" : "text-slate-500"}`}>
            {irregular ? "Período irregular" : "Un año completo"}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Vence la rendición</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {formatFechaCalendarioAR(ejercicio.vencimientoRendicion)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Apertura</p>
          <p
            className={`mt-2 text-lg font-semibold ${
              ejercicio.aperturaEstado === "PENDIENTE" ? "text-amber-700" : "text-slate-950"
            }`}
          >
            {ESTADO_APERTURA_LABEL[ejercicio.aperturaEstado] ?? ejercicio.aperturaEstado}
          </p>
        </article>
      </section>

      <form action={actualizar} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="consorcioId" value={ejercicio.consorcioId} />
        <h2 className="text-lg font-semibold text-slate-900">Período</h2>
        <p className="mt-1 text-sm text-slate-500">
          {cerrado
            ? "El ejercicio está cerrado: sus fechas no se pueden modificar."
            : "Las fechas deben mantener la continuidad con los ejercicios anterior y siguiente."}
        </p>

        <fieldset disabled={!editable} className="disabled:opacity-70">
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div>
              <label htmlFor="fechaInicio" className="text-sm font-medium text-slate-700">
                Inicio
              </label>
              <input
                id="fechaInicio"
                name="fechaInicio"
                type="date"
                required
                defaultValue={formatFechaCalendario(ejercicio.fechaInicio)}
                className={inputClassName()}
              />
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
                defaultValue={formatFechaCalendario(ejercicio.fechaFin)}
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
                defaultValue={formatFechaCalendario(ejercicio.vencimientoRendicion)}
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
                defaultValue={ejercicio.fundamento ?? ""}
                className={inputClassName()}
              />
            </div>
            <div>
              <label htmlFor="observaciones" className="text-sm font-medium text-slate-700">
                Observaciones
              </label>
              <textarea
                id="observaciones"
                name="observaciones"
                rows={3}
                defaultValue={ejercicio.observaciones ?? ""}
                className={inputClassName()}
              />
            </div>
          </div>

          {editable ? (
            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Guardar período
              </button>
            </div>
          ) : null}
        </fieldset>
      </form>

      <form action={apertura} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="consorcioId" value={ejercicio.consorcioId} />
        <h2 className="text-lg font-semibold text-slate-900">Saldos de apertura</h2>
        <p className="mt-1 text-sm text-slate-500">
          Declará si los saldos al inicio del ejercicio (caja, bancos, créditos y deudas) son cero o fueron informados.
          Un saldo desconocido debe quedar como pendiente: nunca se toma como cero.
        </p>

        {ejercicio.aperturaConfirmadaAt ? (
          <p className="mt-3 text-xs text-slate-500">
            Registrado el {formatDateTime(ejercicio.aperturaConfirmadaAt)}
            {confirmadoPor ? ` por ${confirmadoPor.name ?? confirmadoPor.email}` : ""}.
          </p>
        ) : null}

        <fieldset disabled={!editable} className="disabled:opacity-70">
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div>
              <label htmlFor="aperturaEstado" className="text-sm font-medium text-slate-700">
                Estado de la apertura
              </label>
              <select
                id="aperturaEstado"
                name="aperturaEstado"
                defaultValue={ejercicio.aperturaEstado}
                className={inputClassName()}
              >
                {ESTADOS_APERTURA.map((estado) => (
                  <option key={estado} value={estado}>
                    {ESTADO_APERTURA_LABEL[estado]}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="aperturaObservaciones" className="text-sm font-medium text-slate-700">
                Respaldo / observaciones
              </label>
              <textarea
                id="aperturaObservaciones"
                name="aperturaObservaciones"
                rows={3}
                defaultValue={ejercicio.aperturaObservaciones ?? ""}
                placeholder="Ej.: primer ejercicio, sin saldos previos; confirmado por el administrador"
                className={inputClassName()}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            El detalle por cuenta (caja, cada banco, créditos por unidad, proveedores) se cargará junto con la simulación
            del cierre.
          </p>

          {editable ? (
            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Registrar apertura
              </button>
            </div>
          ) : null}
        </fieldset>
      </form>

      <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Simulación del cierre</h2>
        <p className="mt-1 text-sm text-slate-500">
          Próximamente: ingresos y egresos del período, deudas al corte, conciliación de fondos y faltantes, sin
          modificar datos.
        </p>
      </section>

      {eliminable ? (
        <details className="mt-6 rounded-2xl border border-red-200 bg-white p-6">
          <summary className="cursor-pointer text-sm font-medium text-red-700">Eliminar este ejercicio</summary>
          <form action={eliminar} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="consorcioId" value={ejercicio.consorcioId} />
            <div className="flex-1">
              <label htmlFor="confirmacion" className="text-sm text-slate-600">
                Solo se puede eliminar el último ejercicio abierto. Escribí <strong>ELIMINAR</strong> para confirmar.
              </label>
              <input id="confirmacion" name="confirmacion" autoComplete="off" className={inputClassName()} />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-red-300 px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Eliminar
            </button>
          </form>
        </details>
      ) : null}
    </main>
  );
}
