import Link from "next/link";
import { redirect } from "next/navigation";

import { ASAMBLEA_VOTACION_ESTADO } from "@/lib/administracion-shared";
import { getAccessContext } from "@/lib/auth";
import { redirectToOnboardingIfNoConsorcios } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

import { formatDate, formatDateTime } from "../administracion/shared";

function getEstadoBadgeClasses(estado: string) {
  switch (estado) {
    case ASAMBLEA_VOTACION_ESTADO.ABIERTA:
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    case ASAMBLEA_VOTACION_ESTADO.CERRADA:
      return "border border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border border-amber-200 bg-amber-50 text-amber-700";
  }
}

function getFeedback(ok?: string, error?: string) {
  if (ok === "voto_emitido") {
    return { type: "ok" as const, text: "Tu voto fue registrado correctamente." };
  }

  if (error === "persona_no_habilitada") {
    return { type: "error" as const, text: "Tu persona no esta habilitada para votar en este consorcio." };
  }

  if (error === "votacion_cerrada") {
    return { type: "error" as const, text: "La votacion ya no se encuentra abierta." };
  }

  if (error === "votacion_inexistente") {
    return { type: "error" as const, text: "No se encontro la votacion solicitada." };
  }

  if (error === "voto_invalido") {
    return { type: "error" as const, text: "El valor del voto no es valido." };
  }

  return null;
}

export default async function VotacionesPage({
  searchParams,
}: {
  searchParams?: { tab?: string; ok?: string; error?: string };
}) {
  const access = await getAccessContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!access.user.personaId) {
    redirect("/onboarding");
  }

  const activeTab = searchParams?.tab === "historial" ? "historial" : "pendientes";
  const feedback = getFeedback(searchParams?.ok, searchParams?.error);
  const now = new Date();

  const personaRelations = await prisma.unidadPersona.findMany({
    where: {
      personaId: access.user.personaId,
      unidad: {
        consorcioId: { in: access.allowedConsorcioIds },
      },
      desde: { lte: now },
      OR: [{ hasta: null }, { hasta: { gte: now } }],
    },
    select: {
      unidad: {
        select: {
          consorcioId: true,
          consorcio: {
            select: { id: true, nombre: true },
          },
        },
      },
    },
  });

  const eligibleConsorcioMap = new Map<number, { id: number; nombre: string }>();
  for (const relation of personaRelations) {
    eligibleConsorcioMap.set(relation.unidad.consorcio.id, relation.unidad.consorcio);
  }

  const eligibleConsorcioIds = Array.from(eligibleConsorcioMap.keys());

  if (eligibleConsorcioIds.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-950">Votaciones</h1>
          <p className="mt-1 text-sm text-slate-600">
            Aqui veras las votaciones abiertas de los consorcios donde tu persona tiene una unidad vigente.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Tu usuario esta vinculado a una persona, pero hoy no tiene unidades vigentes en los consorcios a los que accedes.
        </div>
      </main>
    );
  }

  const [pendingItems, historyItems] = await Promise.all([
    prisma.asambleaVotacion.findMany({
      where: {
        estado: ASAMBLEA_VOTACION_ESTADO.ABIERTA,
        ordenDia: {
          asamblea: {
            consorcioId: { in: eligibleConsorcioIds },
          },
        },
        votos: {
          none: {
            personaId: access.user.personaId,
          },
        },
      },
      orderBy: [
        { ordenDia: { asamblea: { fecha: "asc" } } },
        { ordenDia: { orden: "asc" } },
        { id: "asc" },
      ],
      select: {
        id: true,
        cuestion: true,
        estado: true,
        ordenDia: {
          select: {
            orden: true,
            titulo: true,
            asamblea: {
              select: {
                id: true,
                fecha: true,
                tipo: true,
                consorcio: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.asambleaVotacionVoto.findMany({
      where: {
        personaId: access.user.personaId,
        votacion: {
          ordenDia: {
            asamblea: {
              consorcioId: { in: access.allowedConsorcioIds },
            },
          },
        },
      },
      orderBy: [{ votadoAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        valor: true,
        votadoAt: true,
        votacion: {
          select: {
            id: true,
            cuestion: true,
            estado: true,
            ordenDia: {
              select: {
                orden: true,
                titulo: true,
                asamblea: {
                  select: {
                    id: true,
                    fecha: true,
                    tipo: true,
                    consorcio: {
                      select: {
                        id: true,
                        nombre: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Votaciones</h1>
          <p className="mt-1 text-sm text-slate-600">
            Consulta las votaciones abiertas de tus consorcios y el historial de participacion de tu persona vinculada.
          </p>
        </div>
      </header>

      {feedback ? (
        <div
          className={`mb-6 rounded-md px-4 py-3 text-sm ${
            feedback.type === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <section className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/votaciones"
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
            activeTab === "pendientes"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Pendientes
        </Link>
        <Link
          href="/votaciones?tab=historial"
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
            activeTab === "historial"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Historial
        </Link>
      </section>

      {activeTab === "pendientes" ? (
        <section className="space-y-4">
          {pendingItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
              No tienes votaciones pendientes en este momento.
            </div>
          ) : (
            pendingItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-500">{item.ordenDia.asamblea.consorcio.nombre}</p>
                    <h2 className="text-lg font-semibold text-slate-950">{item.cuestion}</h2>
                    <p className="text-sm text-slate-600">
                      Asamblea {item.ordenDia.asamblea.tipo.toLowerCase()} del {formatDate(item.ordenDia.asamblea.fecha)}
                    </p>
                    <p className="text-sm text-slate-600">
                      Punto {item.ordenDia.orden}: {item.ordenDia.titulo}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getEstadoBadgeClasses(item.estado)}`}>
                      {item.estado}
                    </span>
                    <Link
                      href={`/votaciones/${item.id}`}
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Votar
                    </Link>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      ) : (
        <section className="space-y-4">
          {historyItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
              Todavia no participaste en ninguna votacion.
            </div>
          ) : (
            historyItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-500">{item.votacion.ordenDia.asamblea.consorcio.nombre}</p>
                    <h2 className="text-lg font-semibold text-slate-950">{item.votacion.cuestion}</h2>
                    <p className="text-sm text-slate-600">
                      Asamblea {item.votacion.ordenDia.asamblea.tipo.toLowerCase()} del {formatDate(item.votacion.ordenDia.asamblea.fecha)}
                    </p>
                    <p className="text-sm text-slate-600">
                      Punto {item.votacion.ordenDia.orden}: {item.votacion.ordenDia.titulo}
                    </p>
                    <p className="text-sm text-slate-600">
                      Votaste {item.valor} el {formatDateTime(item.votadoAt)}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getEstadoBadgeClasses(item.votacion.estado)}`}>
                      {item.votacion.estado}
                    </span>
                    <Link
                      href={`/votaciones/${item.votacion.id}`}
                      className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Ver detalle
                    </Link>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </main>
  );
}
