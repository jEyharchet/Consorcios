import Link from "next/link";

import { getActiveConsorcioContext } from "@/lib/consorcio-activo";
import { EMAIL_RESPUESTA_ESTADO, getRespuestaBodyPreview } from "@/lib/email-replies";
import { redirectToOnboardingIfNoConsorcios } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

import { formatDateTime } from "../shared";

function getEstadoBadgeClasses(estado: string) {
  switch (estado) {
    case EMAIL_RESPUESTA_ESTADO.RESUELTA:
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    case EMAIL_RESPUESTA_ESTADO.LEIDA:
      return "border border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border border-sky-200 bg-sky-50 text-sky-700";
  }
}

function buildContextoLabel(item: {
  asamblea: { id: number; fecha: Date; tipo: string } | null;
  envioEmail: { tipoEnvio: string; liquidacionId: number | null } | null;
}) {
  if (item.asamblea) {
    return {
      label: `Asamblea ${item.asamblea.tipo.toLowerCase()} del ${new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(item.asamblea.fecha)}`,
      href: `/administracion/asambleas/${item.asamblea.id}`,
    };
  }

  if (item.envioEmail?.liquidacionId) {
    return {
      label: `Liquidacion vinculada #${item.envioEmail.liquidacionId}`,
      href: `/liquidaciones/${item.envioEmail.liquidacionId}`,
    };
  }

  if (item.envioEmail) {
    return {
      label: item.envioEmail.tipoEnvio.replaceAll("_", " ").toLowerCase(),
      href: null,
    };
  }

  return {
    label: "Sin contexto asociado",
    href: null,
  };
}

export default async function RespuestasEmailPage() {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion - Respuestas</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo valido para mostrar.
        </p>
      </main>
    );
  }

  const canManage =
    access.isSuperAdmin ||
    access.assignments.some(
      (assignment) =>
        assignment.consorcioId === activeConsorcioId &&
        (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
    );

  const [consorcio, respuestas, summary] = await Promise.all([
    prisma.consorcio.findUnique({
      where: { id: activeConsorcioId },
      select: { id: true, nombre: true },
    }),
    prisma.respuestaEmail.findMany({
      where: { consorcioId: activeConsorcioId },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      include: {
        consorcio: {
          select: { nombre: true },
        },
        persona: {
          select: { id: true, nombre: true, apellido: true },
        },
        asamblea: {
          select: { id: true, fecha: true, tipo: true },
        },
        envioEmail: {
          select: { id: true, tipoEnvio: true, liquidacionId: true },
        },
      },
    }),
    prisma.respuestaEmail.groupBy({
      by: ["estado"],
      where: { consorcioId: activeConsorcioId },
      _count: { _all: true },
    }),
  ]);

  if (!consorcio) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion - Respuestas</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontro el consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  const totals = {
    pendientes: summary.find((item) => item.estado === EMAIL_RESPUESTA_ESTADO.PENDIENTE)?._count._all ?? 0,
    leidas: summary.find((item) => item.estado === EMAIL_RESPUESTA_ESTADO.LEIDA)?._count._all ?? 0,
    resueltas: summary.find((item) => item.estado === EMAIL_RESPUESTA_ESTADO.RESUELTA)?._count._all ?? 0,
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administracion - Respuestas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Bandeja de respuestas recibidas para el consorcio activo - {consorcio.nombre}.
          </p>
        </div>

        <Link
          href="/administracion"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Volver a Administracion
        </Link>
      </header>

      {!canManage ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Necesitas rol ADMIN u OPERADOR sobre este consorcio para gestionar respuestas.
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Pendientes</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{totals.pendientes}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Leidas</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{totals.leidas}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Resueltas</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{totals.resueltas}</p>
            </article>
          </section>

          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Bandeja</h2>
              <p className="mt-1 text-sm text-slate-500">
                Se asocian automaticamente al envio original por `In-Reply-To` y, cuando esta configurado, por alias de
                reply-to.
              </p>
            </div>

            {respuestas.length === 0 ? (
              <div className="px-6 py-10 text-sm text-slate-500">
                Todavia no hay respuestas registradas para este consorcio.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Remitente</th>
                      <th className="px-4 py-3 font-medium">Consorcio</th>
                      <th className="px-4 py-3 font-medium">Asunto</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Contexto</th>
                      <th className="px-4 py-3 font-medium text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {respuestas.map((respuesta) => {
                      const remitenteNombre =
                        respuesta.fromNombre?.trim() ||
                        (respuesta.persona
                          ? `${respuesta.persona.apellido}, ${respuesta.persona.nombre}`
                          : respuesta.fromEmail);
                      const contexto = buildContextoLabel({
                        asamblea: respuesta.asamblea,
                        envioEmail: respuesta.envioEmail,
                      });

                      return (
                        <tr key={respuesta.id} className="align-top">
                          <td className="px-4 py-4 text-slate-600">{formatDateTime(respuesta.receivedAt)}</td>
                          <td className="px-4 py-4">
                            <p className="font-medium text-slate-900">{remitenteNombre}</p>
                            <p className="mt-1 text-slate-500">{respuesta.fromEmail}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">{respuesta.consorcio.nombre}</td>
                          <td className="max-w-sm px-4 py-4">
                            <p className="font-medium text-slate-900">{respuesta.subject}</p>
                            <p className="mt-1 line-clamp-2 text-slate-500">
                              {getRespuestaBodyPreview({
                                bodyTexto: respuesta.bodyTexto,
                                bodyHtml: respuesta.bodyHtml,
                              }) || "Sin contenido legible."}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getEstadoBadgeClasses(respuesta.estado)}`}>
                              {respuesta.estado}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {contexto.href ? (
                              <Link href={contexto.href} className="font-medium text-slate-700 hover:text-slate-950">
                                {contexto.label}
                              </Link>
                            ) : (
                              <span>{contexto.label}</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`/administracion/respuestas/${respuesta.id}`}
                              className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Ver
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
        </>
      )}
    </main>
  );
}
