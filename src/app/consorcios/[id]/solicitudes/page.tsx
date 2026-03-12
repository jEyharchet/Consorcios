import Link from "next/link";

import { requireConsorcioRole } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { approveAccessRequest, rejectAccessRequest } from "../../../onboarding/actions";
import DecisionSubmitButton from "./DecisionSubmitButton";

type SolicitudesPageProps = {
  params: { id: string };
  searchParams?: { error?: string; ok?: string };
};

function getMessage(error?: string, ok?: string) {
  if (error === "not_found") return { type: "error", text: "La solicitud indicada no existe para este consorcio." };
  if (error === "already_resolved") return { type: "error", text: "La solicitud ya fue resuelta previamente o por otro administrador." };
  if (error === "user_not_found") return { type: "error", text: "El usuario solicitante ya no existe o no esta disponible para asignarle acceso." };
  if (error === "persona_not_found") return { type: "error", text: "La persona solicitante ya no esta disponible o no pudo vincularse correctamente." };
  if (error === "unidad_required") return { type: "error", text: "Selecciona una unidad antes de aprobar la integracion." };
  if (error === "unidad_invalid") return { type: "error", text: "La unidad elegida no corresponde a este consorcio." };
  if (error === "approval_failed") return { type: "error", text: "No se pudo aprobar la solicitud. Intenta nuevamente en unos segundos." };
  if (error === "rejection_failed") return { type: "error", text: "No se pudo rechazar la solicitud. Intenta nuevamente en unos segundos." };
  if (ok === "approved") return { type: "ok", text: "Solicitud aprobada y persona integrada a la unidad seleccionada." };
  if (ok === "rejected") return { type: "ok", text: "Solicitud rechazada correctamente." };

  return null;
}

function formatUnidadLabel(unidad: { identificador: string; piso: string | null; departamento: string | null }) {
  const extras = [unidad.piso, unidad.departamento].filter(Boolean).join(" ");
  return extras ? `${unidad.identificador} (${extras})` : unidad.identificador;
}

export default async function ConsorcioSolicitudesPage({ params, searchParams }: SolicitudesPageProps) {
  const consorcioId = Number(params.id);
  await requireConsorcioRole(consorcioId, ["ADMIN"]);

  const consorcio = await prisma.consorcio.findUnique({
    where: { id: consorcioId },
    select: {
      id: true,
      nombre: true,
      unidades: {
        orderBy: [{ piso: "asc" }, { departamento: "asc" }, { identificador: "asc" }],
        select: {
          id: true,
          identificador: true,
          piso: true,
          departamento: true,
        },
      },
    },
  });

  if (!consorcio) {
    return <div className="p-6">Consorcio no encontrado</div>;
  }

  const [pendientes, recientes] = await Promise.all([
    prisma.solicitudAccesoConsorcio.findMany({
      where: {
        consorcioId,
        estado: "PENDIENTE",
      },
      include: {
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            telefono: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            persona: {
              select: {
                nombre: true,
                apellido: true,
                telefono: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.solicitudAccesoConsorcio.findMany({
      where: {
        consorcioId,
        estado: { in: ["APROBADA", "RECHAZADA"] },
      },
      include: {
        persona: {
          select: {
            nombre: true,
            apellido: true,
          },
        },
        unidad: {
          select: {
            identificador: true,
          },
        },
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        resolvedByUser: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const message = getMessage(searchParams?.error, searchParams?.ok);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/consorcios/${consorcioId}`} className="text-blue-600 hover:underline">
          Volver al consorcio
        </Link>
        <h1 className="text-3xl font-semibold text-slate-900">Solicitudes de integracion</h1>
        <p className="text-slate-600">Consorcio: {consorcio.nombre}</p>
      </header>

      {message ? (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${message.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Pendientes</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">{pendientes.length}</span>
        </div>

        {pendientes.length === 0 ? (
          <p className="text-sm text-slate-500">No hay solicitudes pendientes para este consorcio.</p>
        ) : consorcio.unidades.length === 0 ? (
          <p className="text-sm text-amber-700">Este consorcio no tiene unidades cargadas. Crea al menos una unidad antes de aprobar integraciones.</p>
        ) : (
          <div className="space-y-4">
            {pendientes.map((solicitud) => {
              const persona = solicitud.persona ?? solicitud.user.persona;
              const nombreCompleto = persona
                ? `${persona.apellido}, ${persona.nombre}`
                : solicitud.user.name ?? solicitud.user.email ?? `Usuario ${solicitud.user.id}`;

              return (
                <article key={solicitud.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1 text-sm text-slate-600">
                      <p className="text-base font-semibold text-slate-900">{nombreCompleto}</p>
                      <p>{solicitud.persona?.email ?? solicitud.user.email ?? "Sin email"}</p>
                      {persona?.telefono ? <p>{persona.telefono}</p> : null}
                      <p>Solicitada el {solicitud.createdAt.toLocaleDateString()}</p>
                      {solicitud.mensaje ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{solicitud.mensaje}</p> : null}
                    </div>

                    <div className="flex w-full max-w-md flex-col gap-3">
                      <form action={approveAccessRequest} className="space-y-3 rounded-lg border border-slate-200 p-3">
                        <input type="hidden" name="requestId" value={solicitud.id} />
                        <input type="hidden" name="consorcioId" value={consorcioId} />
                        <div className="space-y-1">
                          <label htmlFor={`unidad-${solicitud.id}`} className="text-sm font-medium text-slate-700">
                            Asociar a unidad
                          </label>
                          <select
                            id={`unidad-${solicitud.id}`}
                            name="unidadId"
                            defaultValue=""
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2"
                          >
                            <option value="" disabled>
                              Seleccionar unidad
                            </option>
                            {consorcio.unidades.map((unidad) => (
                              <option key={unidad.id} value={unidad.id}>
                                {formatUnidadLabel(unidad)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <DecisionSubmitButton idleLabel="Aprobar" pendingLabel="Aprobando..." tone="primary" />
                      </form>

                      <form action={rejectAccessRequest}>
                        <input type="hidden" name="requestId" value={solicitud.id} />
                        <input type="hidden" name="consorcioId" value={consorcioId} />
                        <DecisionSubmitButton idleLabel="Rechazar" pendingLabel="Rechazando..." tone="secondary" />
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Ultimas resueltas</h2>

        {recientes.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Todavia no se resolvieron solicitudes para este consorcio.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Persona</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Unidad</th>
                  <th className="px-4 py-3 font-medium">Resuelta por</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((solicitud) => (
                  <tr key={solicitud.id} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3">{solicitud.persona ? `${solicitud.persona.apellido}, ${solicitud.persona.nombre}` : solicitud.user.name ?? solicitud.user.email ?? "Usuario"}</td>
                    <td className="px-4 py-3">{solicitud.estado}</td>
                    <td className="px-4 py-3">{solicitud.unidad?.identificador ?? "-"}</td>
                    <td className="px-4 py-3">{solicitud.resolvedByUser?.name ?? solicitud.resolvedByUser?.email ?? "-"}</td>
                    <td className="px-4 py-3">{solicitud.resolvedAt?.toLocaleDateString() ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
