import Link from "next/link";

import { getActiveConsorcioContext } from "../../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../../lib/onboarding";
import { prisma } from "../../../lib/prisma";
import { formatDate, formatDateTime } from "../shared";

function estadoClass(estado: string) {
  if (estado === "CONVOCADA") {
    return "bg-blue-100 text-blue-800";
  }

  if (estado === "REALIZADA") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (estado === "CERRADA") {
    return "bg-slate-200 text-slate-800";
  }

  return "bg-amber-100 text-amber-800";
}

export default async function AsambleasPage() {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion - Asambleas</h1>
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

  const [consorcio, asambleas, convocatoriasRecientes] = await Promise.all([
    prisma.consorcio.findUnique({
      where: { id: activeConsorcioId },
      select: { id: true, nombre: true },
    }),
    prisma.asamblea.findMany({
      where: { consorcioId: activeConsorcioId },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      include: {
        ordenDia: {
          orderBy: [{ orden: "asc" }, { id: "asc" }],
          select: { id: true },
        },
        _count: {
          select: {
            enviosEmail: true,
          },
        },
      },
    }),
    prisma.envioEmail.findMany({
      where: {
        consorcioId: activeConsorcioId,
        tipoEnvio: "ASAMBLEA_CONVOCATORIA",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      include: {
        asamblea: {
          select: {
            id: true,
            fecha: true,
            tipo: true,
          },
        },
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
        <h1 className="text-2xl font-semibold">Administracion - Asambleas</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontro el consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  const proximas = asambleas.filter((asamblea) => asamblea.fecha >= new Date()).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administracion - Asambleas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gestion de convocatorias, orden del dia y actas para {consorcio.nombre}.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/administracion/asambleas/acta-en-blanco?consorcioId=${consorcio.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Crear acta en blanco
          </a>
          {canOperate ? (
            <Link
              href="/administracion/asambleas/nueva"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Nueva asamblea
            </Link>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Asambleas cargadas</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{asambleas.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Pendientes o futuras</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{proximas}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Convocatorias enviadas</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {convocatoriasRecientes.filter((envio) => envio.estado === "ENVIADO").length}
          </p>
        </article>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Listado</h2>
              <p className="mt-1 text-sm text-slate-500">Historial y seguimiento de asambleas del consorcio activo.</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Lugar</th>
                  <th className="px-3 py-2 font-medium">Orden del dia</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {asambleas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">
                      Todavia no hay asambleas registradas para este consorcio.
                    </td>
                  </tr>
                ) : (
                  asambleas.map((asamblea) => (
                    <tr key={asamblea.id}>
                      <td className="px-3 py-3 text-slate-700">
                        {formatDate(asamblea.fecha)} - {asamblea.hora}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{asamblea.tipo}</td>
                      <td className="px-3 py-3 text-slate-700">{asamblea.lugar}</td>
                      <td className="px-3 py-3 text-slate-700">{asamblea.ordenDia.length}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${estadoClass(asamblea.estado)}`}>
                          {asamblea.estado}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        <Link href={`/administracion/asambleas/${asamblea.id}`} className="text-blue-600 hover:underline">
                          Ver y editar
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Trazabilidad reciente</h2>
          <p className="mt-1 text-sm text-slate-500">Ultimos envios de convocatorias.</p>

          <div className="mt-4 space-y-3">
            {convocatoriasRecientes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                Todavia no hay convocatorias enviadas desde este modulo.
              </p>
            ) : (
              convocatoriasRecientes.map((envio) => (
                <div key={envio.id} className="rounded-lg border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {envio.asamblea ? `${envio.asamblea.tipo} - ${formatDate(envio.asamblea.fecha)}` : "Asamblea"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {envio.unidad ? `${envio.unidad.identificador} (${envio.unidad.tipo})` : "Sin unidad"} -{" "}
                        {envio.destinatario ?? "Sin destinatario"}
                      </p>
                    </div>
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
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{formatDateTime(envio.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
