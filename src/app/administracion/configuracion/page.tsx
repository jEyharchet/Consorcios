import Link from "next/link";
import { redirect } from "next/navigation";

import { requireConsorcioRole } from "../../../lib/auth";
import { getActiveConsorcioContext } from "../../../lib/consorcio-activo";
import {
  COCHERAS_MODOS,
  PLAZO_TIPOS,
  VOTO_DEFAULT_OPCIONES,
  VOTO_MULTIPLES_DUENO_MODOS,
  VOTO_MULTIPLES_UNIDAD_MODOS,
  VOTO_PESO_MODOS,
  VOTO_TIPOS,
  getConfiguracionConsorcio,
  parseBooleanCheckbox,
  parsePositiveInteger,
  validateConsorcioConfiguracionInput,
} from "../../../lib/consorcio-config";
import { redirectToOnboardingIfNoConsorcios } from "../../../lib/onboarding";
import { prisma } from "../../../lib/prisma";
import { buildReturnQuery } from "../shared";

function getFeedback(searchParams: { ok?: string; error?: string }) {
  if (searchParams.ok === "configuracion_guardada") {
    return {
      type: "ok" as const,
      text: "La configuracion del consorcio se guardo correctamente.",
    };
  }

  switch (searchParams.error) {
    case "consorcio_invalido":
      return { type: "error" as const, text: "No se pudo resolver el consorcio activo." };
    case "cocheras_modo_invalido":
      return { type: "error" as const, text: "El criterio de expensas para cocheras no es valido." };
    case "voto_tipo_invalido":
      return { type: "error" as const, text: "El tipo de voto seleccionado no es valido." };
    case "voto_multiples_dueno_invalido":
      return { type: "error" as const, text: "La regla de multiples duenos no es valida." };
    case "voto_multiples_unidad_invalido":
      return { type: "error" as const, text: "La regla de multiples unidades no es valida." };
    case "voto_peso_invalido":
      return { type: "error" as const, text: "El peso de voto seleccionado no es valido." };
    case "plazo_tipo_invalido":
      return { type: "error" as const, text: "El tipo de plazo seleccionado no es valido." };
    case "plazo_dias_invalido":
      return { type: "error" as const, text: "Los dias de plazo deben ser un entero positivo entre 1 y 365." };
    case "voto_default_invalido":
      return { type: "error" as const, text: "El comportamiento por defecto al expirar no es valido." };
    default:
      return null;
  }
}

function selectClassName() {
  return "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:border-slate-400 focus:ring-2";
}

function inputClassName() {
  return "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:border-slate-400 focus:ring-2";
}

export default async function ConfiguracionConsorcioPage({
  searchParams,
}: {
  searchParams?: { ok?: string; error?: string };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion - Configuracion</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo valido para mostrar.
        </p>
      </main>
    );
  }

  const canOperate =
    access.isSuperAdmin ||
    access.assignments.some(
      (assignment) =>
        assignment.consorcioId === activeConsorcioId &&
        (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
    );

  async function updateConfiguracion(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));

    if (!Number.isInteger(consorcioId) || consorcioId <= 0) {
      redirect(`/administracion/configuracion${buildReturnQuery({ error: "consorcio_invalido" })}`);
    }

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    const parsed = validateConsorcioConfiguracionInput({
      cocherasModo: (formData.get("cocherasModo")?.toString() ?? "").trim(),
      votoTipo: (formData.get("votoTipo")?.toString() ?? "").trim(),
      votoMultiplesDueno: (formData.get("votoMultiplesDueno")?.toString() ?? "").trim(),
      votoMultiplesUnidad: (formData.get("votoMultiplesUnidad")?.toString() ?? "").trim(),
      votoPeso: (formData.get("votoPeso")?.toString() ?? "").trim(),
      plazoTipo: (formData.get("plazoTipo")?.toString() ?? "").trim(),
      plazoDias: parsePositiveInteger((formData.get("plazoDias")?.toString() ?? "").trim()) ?? -1,
      votoDefault: (formData.get("votoDefault")?.toString() ?? "").trim(),
      enviarCopiaAdmin: parseBooleanCheckbox(formData.get("enviarCopiaAdmin")),
    });

    if (!parsed.ok) {
      redirect(`/administracion/configuracion${buildReturnQuery({ error: parsed.error })}`);
    }

    await prisma.consorcioConfiguracion.upsert({
      where: { consorcioId },
      update: parsed.value,
      create: {
        consorcioId,
        ...parsed.value,
      },
    });

    redirect(`/administracion/configuracion${buildReturnQuery({ ok: "configuracion_guardada" })}`);
  }

  const [consorcio, configuracion] = await Promise.all([
    prisma.consorcio.findUnique({
      where: { id: activeConsorcioId },
      select: { id: true, nombre: true },
    }),
    getConfiguracionConsorcio(activeConsorcioId),
  ]);

  if (!consorcio) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion - Configuracion</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontro el consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  const feedback = getFeedback(searchParams ?? {});

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administracion - Configuracion</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reglas de negocio del consorcio activo que luego impactaran en expensas, votaciones y convocatorias.
          </p>
          <p className="mt-1 text-sm text-slate-500">Consorcio activo: {consorcio.nombre}</p>
        </div>

        <Link
          href="/administracion"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver modulo
        </Link>
      </header>

      {feedback ? (
        <div
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            feedback.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {!canOperate ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tenes acceso de lectura. Solo usuarios ADMIN u OPERADOR pueden modificar esta configuracion.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Expensas</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {configuracion.cocherasModo === "SOLO_COCHERAS" ? "Solo cocheras" : "Todas las unidades"}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Voto base</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {configuracion.votoTipo === "UNIDAD" ? "Por unidad" : "Por persona"}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Plazo</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{configuracion.plazoDias} dias</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Copias al admin</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {configuracion.enviarCopiaAdmin ? "Habilitadas" : "Deshabilitadas"}
          </p>
        </article>
      </section>

      <form action={updateConfiguracion} className="mt-8 space-y-6">
        <input type="hidden" name="consorcioId" value={consorcio.id} />

        <fieldset disabled={!canOperate} className="space-y-6 disabled:opacity-70">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Expensas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Define si el comportamiento futuro debe contemplar todas las unidades o solo las que tengan cochera.
            </p>

            <div className="mt-5">
              <label htmlFor="cocherasModo" className="text-sm font-medium text-slate-700">
                Tratamiento de cocheras
              </label>
              <select
                id="cocherasModo"
                name="cocherasModo"
                defaultValue={configuracion.cocherasModo}
                className={selectClassName()}
              >
                <option value={COCHERAS_MODOS[0]}>TODAS las unidades</option>
                <option value={COCHERAS_MODOS[1]}>SOLO unidades con cochera</option>
              </select>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Votaciones</h2>
            <p className="mt-1 text-sm text-slate-500">
              Base reglamentaria para definir identidad del voto, unificacion de titulares y peso de cada decision.
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="votoTipo" className="text-sm font-medium text-slate-700">
                  Tipo de voto
                </label>
                <select id="votoTipo" name="votoTipo" defaultValue={configuracion.votoTipo} className={selectClassName()}>
                  <option value={VOTO_TIPOS[0]}>Por persona</option>
                  <option value={VOTO_TIPOS[1]}>Por unidad</option>
                </select>
              </div>

              <div>
                <label htmlFor="votoMultiplesDueno" className="text-sm font-medium text-slate-700">
                  Multiples dueños
                </label>
                <select
                  id="votoMultiplesDueno"
                  name="votoMultiplesDueno"
                  defaultValue={configuracion.votoMultiplesDueno}
                  className={selectClassName()}
                >
                  <option value={VOTO_MULTIPLES_DUENO_MODOS[0]}>Individual</option>
                  <option value={VOTO_MULTIPLES_DUENO_MODOS[1]}>Unificado</option>
                </select>
              </div>

              <div>
                <label htmlFor="votoMultiplesUnidad" className="text-sm font-medium text-slate-700">
                  Multiples unidades
                </label>
                <select
                  id="votoMultiplesUnidad"
                  name="votoMultiplesUnidad"
                  defaultValue={configuracion.votoMultiplesUnidad}
                  className={selectClassName()}
                >
                  <option value={VOTO_MULTIPLES_UNIDAD_MODOS[0]}>Uno</option>
                  <option value={VOTO_MULTIPLES_UNIDAD_MODOS[1]}>Multiples</option>
                </select>
              </div>

              <div>
                <label htmlFor="votoPeso" className="text-sm font-medium text-slate-700">
                  Peso del voto
                </label>
                <select id="votoPeso" name="votoPeso" defaultValue={configuracion.votoPeso} className={selectClassName()}>
                  <option value={VOTO_PESO_MODOS[0]}>Igualitario</option>
                  <option value={VOTO_PESO_MODOS[1]}>Proporcional</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Plazos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Parametriza desde cuando corre el plazo legal y cual sera el efecto por defecto al expirar.
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <div>
                <label htmlFor="plazoTipo" className="text-sm font-medium text-slate-700">
                  Punto de inicio
                </label>
                <select id="plazoTipo" name="plazoTipo" defaultValue={configuracion.plazoTipo} className={selectClassName()}>
                  <option value={PLAZO_TIPOS[0]}>Desde apertura</option>
                  <option value={PLAZO_TIPOS[1]}>Desde envio de acta</option>
                </select>
              </div>

              <div>
                <label htmlFor="plazoDias" className="text-sm font-medium text-slate-700">
                  Dias
                </label>
                <input
                  id="plazoDias"
                  name="plazoDias"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={configuracion.plazoDias}
                  className={inputClassName()}
                />
              </div>

              <div>
                <label htmlFor="votoDefault" className="text-sm font-medium text-slate-700">
                  Comportamiento al expirar
                </label>
                <select
                  id="votoDefault"
                  name="votoDefault"
                  defaultValue={configuracion.votoDefault}
                  className={selectClassName()}
                >
                  <option value={VOTO_DEFAULT_OPCIONES[0]}>Positivo</option>
                  <option value={VOTO_DEFAULT_OPCIONES[1]}>Negativo</option>
                  <option value={VOTO_DEFAULT_OPCIONES[2]}>Abstencion</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Otros</h2>
            <p className="mt-1 text-sm text-slate-500">
              Opciones generales de comportamiento que deben quedar desacopladas del resto de los modulos.
            </p>

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                name="enviarCopiaAdmin"
                defaultChecked={configuracion.enviarCopiaAdmin}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Enviar copia al administrador</span>
                <span className="mt-1 block text-sm text-slate-500">
                  Deja preparada la regla para futuras convocatorias y comunicaciones institucionales.
                </span>
              </span>
            </label>
          </section>
        </fieldset>

        {canOperate ? (
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Guardar configuracion
            </button>
          </div>
        ) : null}
      </form>
    </main>
  );
}
