import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ASAMBLEA_VOTO_VALOR } from "@/lib/administracion-shared";
import {
  canReceiveVotes,
  formatPersonaNombre,
  getPersonasConsorcioParaVotacion,
  registrarVotoAsamblea,
} from "@/lib/asamblea-votaciones";
import { getAccessContext } from "@/lib/auth";
import { redirectToOnboardingIfNoConsorcios } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

import { formatDate, formatDateTime } from "../../administracion/shared";

function getEstadoBadgeClasses(estado: string) {
  if (estado === "ABIERTA") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (estado === "CERRADA") {
    return "border border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border border-amber-200 bg-amber-50 text-amber-700";
}

function getFeedback(ok?: string, error?: string) {
  if (ok === "voto_emitido") {
    return { type: "ok" as const, text: "Tu voto fue registrado correctamente." };
  }

  if (error === "votacion_cerrada") {
    return { type: "error" as const, text: "La votacion ya no se encuentra abierta." };
  }

  if (error === "persona_no_habilitada") {
    return { type: "error" as const, text: "Tu persona no esta habilitada para votar en este consorcio." };
  }

  if (error === "voto_invalido") {
    return { type: "error" as const, text: "El valor del voto no es valido." };
  }

  if (error === "votacion_inexistente") {
    return { type: "error" as const, text: "No se encontro la votacion solicitada." };
  }

  return null;
}

export default async function VotacionDetallePage({
  params,
  searchParams,
}: {
  params: { votacionId: string };
  searchParams?: { ok?: string; error?: string };
}) {
  const votacionId = Number(params.votacionId);

  if (!Number.isInteger(votacionId) || votacionId <= 0) {
    notFound();
  }

  const access = await getAccessContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!access.user.personaId) {
    redirect("/onboarding");
  }

  const votacion = await prisma.asambleaVotacion.findUnique({
    where: { id: votacionId },
    select: {
      id: true,
      cuestion: true,
      estado: true,
      votos: {
        where: {
          personaId: access.user.personaId,
        },
        select: {
          id: true,
          valor: true,
          votadoAt: true,
        },
        take: 1,
      },
      ordenDia: {
        select: {
          orden: true,
          titulo: true,
          descripcion: true,
          asamblea: {
            select: {
              id: true,
              tipo: true,
              fecha: true,
              lugar: true,
              consorcioId: true,
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
  });

  if (!votacion) {
    notFound();
  }

  const consorcioId = votacion.ordenDia.asamblea.consorcioId;

  if (!access.isSuperAdmin && !access.allowedConsorcioIds.includes(consorcioId)) {
    notFound();
  }

  const personasHabilitadas = await getPersonasConsorcioParaVotacion(consorcioId);
  const currentPersona = personasHabilitadas.find((persona) => persona.id === access.user.personaId) ?? null;

  if (!currentPersona) {
    redirect(`/votaciones?error=persona_no_habilitada`);
  }

  async function emitirVoto(formData: FormData) {
    "use server";

    const targetVotacionId = Number(formData.get("votacionId"));
    const targetConsorcioId = Number(formData.get("consorcioId"));
    const valor = (formData.get("valor")?.toString() ?? "").trim();

    const currentAccess = await getAccessContext();

    if (!currentAccess.user.personaId) {
      redirect(`/votaciones/${targetVotacionId}?error=persona_no_habilitada`);
    }

    if (
      valor !== ASAMBLEA_VOTO_VALOR.POSITIVO &&
      valor !== ASAMBLEA_VOTO_VALOR.NEGATIVO
    ) {
      redirect(`/votaciones/${targetVotacionId}?error=voto_invalido`);
    }

    if (!currentAccess.isSuperAdmin && !currentAccess.allowedConsorcioIds.includes(targetConsorcioId)) {
      redirect(`/votaciones/${targetVotacionId}?error=votacion_inexistente`);
    }

    const targetVotacion = await prisma.asambleaVotacion.findUnique({
      where: { id: targetVotacionId },
      select: {
        id: true,
        estado: true,
        ordenDia: {
          select: {
            asamblea: {
              select: { consorcioId: true },
            },
          },
        },
      },
    });

    if (!targetVotacion || targetVotacion.ordenDia.asamblea.consorcioId !== targetConsorcioId) {
      redirect(`/votaciones/${targetVotacionId}?error=votacion_inexistente`);
    }

    if (!canReceiveVotes(targetVotacion.estado)) {
      redirect(`/votaciones/${targetVotacionId}?error=votacion_cerrada`);
    }

    const personasDisponibles = await getPersonasConsorcioParaVotacion(targetConsorcioId);
    const habilitada = personasDisponibles.some((persona) => persona.id === currentAccess.user.personaId);

    if (!habilitada) {
      redirect(`/votaciones/${targetVotacionId}?error=persona_no_habilitada`);
    }

    await registrarVotoAsamblea({
      votacionId: targetVotacionId,
      personaId: currentAccess.user.personaId,
      valor,
      registradoPorAdministrador: false,
      registradoPorUserId: currentAccess.user.id,
    });

    redirect(`/votaciones/${targetVotacionId}?ok=voto_emitido`);
  }

  const feedback = getFeedback(searchParams?.ok, searchParams?.error);
  const votoPropio = votacion.votos[0] ?? null;
  const canVote = canReceiveVotes(votacion.estado);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/votaciones" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Volver a Votaciones
          </Link>
          <p className="mt-3 text-sm font-medium text-slate-500">{votacion.ordenDia.asamblea.consorcio.nombre}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{votacion.cuestion}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Asamblea {votacion.ordenDia.asamblea.tipo.toLowerCase()} del {formatDate(votacion.ordenDia.asamblea.fecha)}
          </p>
        </div>

        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getEstadoBadgeClasses(votacion.estado)}`}>
          {votacion.estado}
        </span>
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

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Detalle de la votacion</h2>
          <dl className="mt-4 grid gap-x-5 gap-y-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500">Punto del orden del dia</dt>
              <dd className="mt-1 text-slate-900">
                Punto {votacion.ordenDia.orden}: {votacion.ordenDia.titulo}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Asamblea</dt>
              <dd className="mt-1 text-slate-900">
                {votacion.ordenDia.asamblea.tipo} - {formatDate(votacion.ordenDia.asamblea.fecha)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-slate-500">Cuestion a votar</dt>
              <dd className="mt-1 text-slate-900">{votacion.cuestion}</dd>
            </div>
            {votacion.ordenDia.descripcion ? (
              <div className="sm:col-span-2">
                <dt className="font-medium text-slate-500">Descripcion del punto</dt>
                <dd className="mt-1 whitespace-pre-wrap text-slate-900">{votacion.ordenDia.descripcion}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium text-slate-500">Lugar</dt>
              <dd className="mt-1 text-slate-900">{votacion.ordenDia.asamblea.lugar}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Tu participacion</h2>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p><strong>Persona:</strong> {formatPersonaNombre(currentPersona)}</p>
            <p className="mt-1"><strong>Unidades:</strong> {currentPersona.unidadesLabel}</p>
            <p className="mt-1"><strong>Estado de tu voto:</strong> {votoPropio ? votoPropio.valor : "Pendiente"}</p>
            {votoPropio ? (
              <p className="mt-1"><strong>Fecha del voto:</strong> {formatDateTime(votoPropio.votadoAt)}</p>
            ) : null}
          </div>

          {canVote ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-slate-600">La votacion se encuentra abierta. Puedes emitir o actualizar tu voto.</p>
              <div className="flex flex-wrap gap-3">
                <form action={emitirVoto}>
                  <input type="hidden" name="votacionId" value={votacion.id} />
                  <input type="hidden" name="consorcioId" value={consorcioId} />
                  <input type="hidden" name="valor" value={ASAMBLEA_VOTO_VALOR.POSITIVO} />
                  <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                    Votar positivo
                  </button>
                </form>
                <form action={emitirVoto}>
                  <input type="hidden" name="votacionId" value={votacion.id} />
                  <input type="hidden" name="consorcioId" value={consorcioId} />
                  <input type="hidden" name="valor" value={ASAMBLEA_VOTO_VALOR.NEGATIVO} />
                  <button type="submit" className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
                    Votar negativo
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
              Esta votacion no se encuentra abierta en este momento.
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
