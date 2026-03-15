import Link from "next/link";
import { redirect } from "next/navigation";

import { enviarComunicacionConsorcio } from "../../../lib/administracion";
import { requireConsorcioRole } from "../../../lib/auth";
import { getActiveConsorcioContext } from "../../../lib/consorcio-activo";
import { formatEmailSummary } from "../../../lib/email-tracking";
import { redirectToOnboardingIfNoConsorcios } from "../../../lib/onboarding";
import { prisma } from "../../../lib/prisma";
import { buildReturnQuery, formatDateTime } from "../shared";

function getFeedback(searchParams: {
  ok?: string;
  error?: string;
  enviados?: string;
  fallidos?: string;
  sinDestinatario?: string;
}) {
  if (searchParams.ok === "comunicacion_ok") {
    const enviados = Number(searchParams.enviados ?? 0);
    const fallidos = Number(searchParams.fallidos ?? 0);
    const sinDestinatario = Number(searchParams.sinDestinatario ?? 0);

    return {
      type: "ok" as const,
      text: formatEmailSummary({
        total: enviados + fallidos + sinDestinatario,
        enviados,
        fallidos,
        sinDestinatario,
      }),
    };
  }

  switch (searchParams.error) {
    case "asunto_requerido":
      return { type: "error" as const, text: "El asunto es obligatorio." };
    case "cuerpo_requerido":
      return { type: "error" as const, text: "El cuerpo del mail es obligatorio." };
    case "sin_unidades":
      return { type: "error" as const, text: "Debes seleccionar al menos una unidad." };
    case "consorcio_inexistente":
      return { type: "error" as const, text: "No se encontro el consorcio activo seleccionado." };
    default:
      return null;
  }
}

export default async function ComunicacionesPage({
  searchParams,
}: {
  searchParams?: {
    ok?: string;
    error?: string;
    enviados?: string;
    fallidos?: string;
    sinDestinatario?: string;
  };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion - Comunicaciones</h1>
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

  async function enviarComunicacion(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const alcance = (formData.get("alcance")?.toString() ?? "ALL").trim();
    const asunto = (formData.get("asunto")?.toString() ?? "").trim();
    const cuerpo = (formData.get("cuerpo")?.toString() ?? "").trim();
    const unidadIds = formData
      .getAll("unidadIds")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    if (!asunto) {
      redirect(`/administracion/comunicaciones${buildReturnQuery({ error: "asunto_requerido" })}`);
    }

    if (!cuerpo) {
      redirect(`/administracion/comunicaciones${buildReturnQuery({ error: "cuerpo_requerido" })}`);
    }

    if (alcance === "UNIDADES" && unidadIds.length === 0) {
      redirect(`/administracion/comunicaciones${buildReturnQuery({ error: "sin_unidades" })}`);
    }

    const summary = await enviarComunicacionConsorcio({
      consorcioId,
      asunto,
      cuerpo,
      unidadIds: alcance === "UNIDADES" ? unidadIds : undefined,
    });

    redirect(
      `/administracion/comunicaciones${buildReturnQuery({
        ok: "comunicacion_ok",
        enviados: String(summary.enviados),
        fallidos: String(summary.fallidos),
        sinDestinatario: String(summary.sinDestinatario),
      })}`,
    );
  }

  const [consorcio, unidades, enviosRecientes] = await Promise.all([
    prisma.consorcio.findUnique({
      where: { id: activeConsorcioId },
      select: { id: true, nombre: true },
    }),
    prisma.unidad.findMany({
      where: { consorcioId: activeConsorcioId },
      orderBy: [{ identificador: "asc" }, { id: "asc" }],
      select: {
        id: true,
        identificador: true,
        tipo: true,
        personas: {
          orderBy: [{ desde: "desc" }, { persona: { apellido: "asc" } }, { persona: { nombre: "asc" } }],
          select: {
            desde: true,
            hasta: true,
            persona: {
              select: {
                nombre: true,
                apellido: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.envioEmail.findMany({
      where: {
        consorcioId: activeConsorcioId,
        tipoEnvio: "COMUNICACION_LIBRE",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      include: {
        unidad: {
          select: {
            identificador: true,
            tipo: true,
          },
        },
      },
    }),
  ]);

  if (!consorcio) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion - Comunicaciones</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontro el consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  const feedback = getFeedback(searchParams ?? {});
  const totalResponsables = unidades.reduce((acc, unidad) => {
    const emails = unidad.personas
      .map((relacion) => relacion.persona.email?.trim().toLowerCase() ?? "")
      .filter(Boolean);

    return acc + new Set(emails).size;
  }, 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administracion - Comunicaciones</h1>
          <p className="mt-1 text-sm text-slate-600">
            Envio manual de mails institucionales para el consorcio activo - {consorcio.nombre}.
          </p>
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
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            feedback.type === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Unidades del consorcio</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{unidades.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Responsables potenciales</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{totalResponsables}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Ultimos envios trazados</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{enviosRecientes.length}</p>
        </article>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Redactar mail</h2>
            <p className="mt-1 text-sm text-slate-500">
              Placeholders disponibles: {"{{responsable}}"}, {"{{unidad}}"}, {"{{consorcio}}"}.
            </p>
          </div>

          {canOperate ? (
            <form action={enviarComunicacion} className="mt-5 space-y-5">
              <input type="hidden" name="consorcioId" value={consorcio.id} />

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Destinatarios</label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
                    <input type="radio" name="alcance" value="ALL" defaultChecked className="mr-2" />
                    Todos los responsables del consorcio
                  </label>
                  <label className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
                    <input type="radio" name="alcance" value="UNIDADES" className="mr-2" />
                    Solo unidades especificas
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="asunto" className="text-sm font-medium text-slate-700">
                  Asunto
                </label>
                <input
                  id="asunto"
                  name="asunto"
                  defaultValue={`Comunicacion de ${consorcio.nombre} para {{unidad}}`}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="cuerpo" className="text-sm font-medium text-slate-700">
                  Cuerpo
                </label>
                <textarea
                  id="cuerpo"
                  name="cuerpo"
                  rows={12}
                  defaultValue={`Estimado/a {{responsable}},\n\nTe escribimos en relacion con la unidad {{unidad}} del consorcio {{consorcio}}.\n\nSaludos,\nAdministracion`}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Seleccion de unidades</h3>
                    <p className="text-xs text-slate-500">Se usa solo si elegis &quot;Solo unidades especificas&quot;.</p>
                  </div>
                </div>

                <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {unidades.map((unidad) => (
                    <label
                      key={unidad.id}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <input type="checkbox" name="unidadIds" value={unidad.id} className="mr-2" />
                      {unidad.identificador} ({unidad.tipo})
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Enviar comunicacion
              </button>
            </form>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
              Tenes acceso de lectura. El envio manual de comunicaciones esta disponible para administradores u operadores.
            </p>
          )}
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Vista operativa</h2>
          <div className="mt-4 space-y-4 text-sm text-slate-600">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">Como se envia</p>
              <p className="mt-1">
                Se genera un envio por unidad seleccionada, dirigido a los responsables vigentes con email valido.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">Trazabilidad</p>
              <p className="mt-1">
                Cada intento queda registrado como enviado, fallido o sin destinatario usando la infraestructura existente.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">Personalizacion</p>
              <p className="mt-1">
                Los placeholders se reemplazan por responsable, unidad y consorcio en asunto y cuerpo.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Trazabilidad reciente</h2>
        <p className="mt-1 text-sm text-slate-500">Ultimos envios del submodulo de comunicaciones del consorcio activo.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Unidad</th>
                <th className="px-3 py-2 font-medium">Destinatario</th>
                <th className="px-3 py-2 font-medium">Asunto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enviosRecientes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-slate-500">
                    Todavia no hay comunicaciones enviadas desde este modulo.
                  </td>
                </tr>
              ) : (
                enviosRecientes.map((envio) => (
                  <tr key={envio.id}>
                    <td className="px-3 py-3 text-slate-700">{formatDateTime(envio.createdAt)}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {envio.unidad ? `${envio.unidad.identificador} (${envio.unidad.tipo})` : "-"}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{envio.destinatario ?? "Sin destinatario"}</td>
                    <td className="px-3 py-3 text-slate-700">{envio.asunto}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          envio.estado === "ENVIADO"
                            ? "bg-emerald-100 text-emerald-800"
                            : envio.estado === "ERROR"
                              ? "bg-red-100 text-red-700"
                              : envio.estado === "SIN_DESTINATARIO"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {envio.estado}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
