import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ASAMBLEA_VOTACION_ESTADO,
  ASAMBLEA_VOTO_VALOR,
  isAsambleaVotacionEstado,
  isAsambleaVotoValor,
} from "../../../../../lib/administracion-shared";
import {
  canReceiveVotes,
  formatPersonaNombre,
  getPersonasConsorcioParaVotacion,
  registrarVotoAsamblea,
  summarizeVotacion,
} from "../../../../../lib/asamblea-votaciones";
import { requireConsorcioAccess, requireConsorcioRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { formatDateTime } from "../../../shared";

function buildBadgeClass(estado: string) {
  if (estado === ASAMBLEA_VOTACION_ESTADO.ABIERTA) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (estado === ASAMBLEA_VOTACION_ESTADO.CERRADA) {
    return "bg-slate-200 text-slate-800";
  }

  return "bg-amber-100 text-amber-800";
}

export default async function AsambleaVotacionDetallePage({
  params,
  searchParams,
}: {
  params: { votacionId: string };
  searchParams?: {
    ok?: string;
    valor?: string;
    error?: string;
  };
}) {
  const votacionId = Number(params.votacionId);

  if (!Number.isInteger(votacionId)) {
    notFound();
  }

  const votacion = await prisma.asambleaVotacion.findUnique({
    where: { id: votacionId },
    include: {
      ordenDia: {
        include: {
          asamblea: {
            include: {
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
      votos: {
        include: {
          persona: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              email: true,
            },
          },
          registradoPorUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ votadoAt: "desc" }, { id: "desc" }],
      },
    },
  });

  if (!votacion) {
    notFound();
  }

  const consorcioId = votacion.ordenDia.asamblea.consorcioId;
  const access = await requireConsorcioAccess(consorcioId);
  const canManage =
    access.isSuperAdmin ||
    access.assignments.some(
      (assignment) =>
        assignment.consorcioId === consorcioId &&
        (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
    );

  const personas = await getPersonasConsorcioParaVotacion(consorcioId);
  const votosByPersona = new Map(votacion.votos.map((voto) => [voto.personaId, voto]));
  const currentPersona = access.user.personaId ? personas.find((persona) => persona.id === access.user.personaId) : null;
  const votoPropio = currentPersona ? votosByPersona.get(currentPersona.id) ?? null : null;
  const resumen = summarizeVotacion({
    totalPersonas: personas.length,
    votos: votacion.votos,
  });

  async function emitirVotoPropio(formData: FormData) {
    "use server";

    const targetVotacionId = Number(formData.get("votacionId"));
    const targetConsorcioId = Number(formData.get("consorcioId"));
    const rawValor = (formData.get("valor")?.toString() ?? "").trim();

    if (!isAsambleaVotoValor(rawValor)) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=voto_invalido`);
    }

    const valor = rawValor;

    const currentAccess = await requireConsorcioAccess(targetConsorcioId);

    if (!currentAccess.user.personaId) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=persona_no_habilitada`);
    }

    const targetVotacion = await prisma.asambleaVotacion.findUnique({
      where: { id: targetVotacionId },
      select: {
        id: true,
        estado: true,
        ordenDia: {
          select: {
            asamblea: {
              select: {
                consorcioId: true,
              },
            },
          },
        },
      },
    });

    if (!targetVotacion || targetVotacion.ordenDia.asamblea.consorcioId !== targetConsorcioId) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=votacion_inexistente`);
    }

    if (!canReceiveVotes(targetVotacion.estado)) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=votacion_cerrada`);
    }

    const personasDisponibles = await getPersonasConsorcioParaVotacion(targetConsorcioId);
    const habilitada = personasDisponibles.some((persona) => persona.id === currentAccess.user.personaId);

    if (!habilitada) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=persona_no_habilitada`);
    }

    await registrarVotoAsamblea({
      votacionId: targetVotacionId,
      personaId: currentAccess.user.personaId,
      valor,
      registradoPorAdministrador: false,
      registradoPorUserId: currentAccess.user.id,
    });

    redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?ok=voto_emitido&valor=${valor}`);
  }

  async function registrarVotoAdministrador(formData: FormData) {
    "use server";

    const targetVotacionId = Number(formData.get("votacionId"));
    const targetConsorcioId = Number(formData.get("consorcioId"));
    const personaId = Number(formData.get("personaId"));
    const rawValor = (formData.get("valor")?.toString() ?? "").trim();

    if (!isAsambleaVotoValor(rawValor)) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=voto_invalido`);
    }

    const valor = rawValor;

    const currentAccess = await requireConsorcioRole(targetConsorcioId, ["ADMIN", "OPERADOR"]);

    const targetVotacion = await prisma.asambleaVotacion.findUnique({
      where: { id: targetVotacionId },
      select: {
        id: true,
        estado: true,
        ordenDia: {
          select: {
            asamblea: {
              select: {
                consorcioId: true,
              },
            },
          },
        },
      },
    });

    if (!targetVotacion || targetVotacion.ordenDia.asamblea.consorcioId !== targetConsorcioId) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=votacion_inexistente`);
    }

    if (!canReceiveVotes(targetVotacion.estado)) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=votacion_cerrada`);
    }

    const personasDisponibles = await getPersonasConsorcioParaVotacion(targetConsorcioId);
    const habilitada = personasDisponibles.some((persona) => persona.id === personaId);

    if (!habilitada) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=persona_no_habilitada`);
    }

    await registrarVotoAsamblea({
      votacionId: targetVotacionId,
      personaId,
      valor,
      registradoPorAdministrador: true,
      registradoPorUserId: currentAccess.user.id,
    });

    redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?ok=voto_admin_registrado`);
  }

  async function actualizarEstado(formData: FormData) {
    "use server";

    const targetVotacionId = Number(formData.get("votacionId"));
    const targetConsorcioId = Number(formData.get("consorcioId"));
    const rawEstado = (formData.get("estado")?.toString() ?? ASAMBLEA_VOTACION_ESTADO.BORRADOR).trim();

    if (!isAsambleaVotacionEstado(rawEstado)) {
      redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?error=estado_invalido`);
    }

    const estado = rawEstado;

    await requireConsorcioRole(targetConsorcioId, ["ADMIN", "OPERADOR"]);

    await prisma.asambleaVotacion.update({
      where: { id: targetVotacionId },
      data: { estado },
    });

    redirect(`/administracion/asambleas/votaciones/${targetVotacionId}?ok=estado_actualizado`);
  }

  const ownVoteConfirmation =
    searchParams?.ok === "voto_emitido" && searchParams.valor
      ? `Confirmación del voto para la cuestión "${votacion.cuestion}", voto: "${searchParams.valor}".`
      : null;

  const feedback =
    ownVoteConfirmation ??
    (searchParams?.ok === "voto_admin_registrado"
      ? "El voto fue registrado correctamente por el administrador."
      : searchParams?.ok === "estado_actualizado"
        ? "El estado de la votacion se actualizo correctamente."
        : searchParams?.error === "votacion_cerrada"
          ? "La votacion no esta abierta para recibir votos."
        : searchParams?.error === "persona_no_habilitada"
          ? "Tu persona no esta habilitada para votar en este consorcio."
          : searchParams?.error === "voto_invalido"
            ? "El valor del voto no es valido."
            : searchParams?.error === "estado_invalido"
              ? "El estado solicitado para la votacion no es valido."
            : searchParams?.error === "votacion_inexistente"
              ? "No se encontro la votacion indicada."
              : null);

  const feedbackType =
    ownVoteConfirmation || searchParams?.ok === "voto_admin_registrado" || searchParams?.ok === "estado_actualizado"
      ? "ok"
      : searchParams?.error
        ? "error"
        : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/administracion/asambleas/${votacion.ordenDia.asambleaId}`} className="text-blue-600 hover:underline">
          Volver a la asamblea
        </Link>
        <span className="text-slate-400">/</span>
        <span className="text-slate-600">Votacion</span>
      </div>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">{votacion.ordenDia.asamblea.consorcio.nombre}</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{votacion.cuestion}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Punto {votacion.ordenDia.orden}: {votacion.ordenDia.titulo}
          </p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${buildBadgeClass(votacion.estado)}`}>
          {votacion.estado}
        </span>
      </header>

      {feedback && feedbackType ? (
        <div
          className={`mt-6 rounded-xl px-4 py-3 text-sm ${
            feedbackType === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback}
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Votos positivos</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">{resumen.positivos}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Votos negativos</p>
          <p className="mt-2 text-3xl font-semibold text-rose-700">{resumen.negativos}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Pendientes de votar</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{resumen.pendientes}</p>
        </article>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Detalle de la votacion</h2>
            <p className="mt-1 text-sm text-slate-500">Cuestion a votar y estado actual.</p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <p><strong>Punto del orden del dia:</strong> {votacion.ordenDia.titulo}</p>
              <p><strong>Cuestion:</strong> {votacion.cuestion}</p>
              <p><strong>Estado:</strong> {votacion.estado}</p>
            </div>

            {canManage ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <form action={actualizarEstado}>
                  <input type="hidden" name="votacionId" value={votacion.id} />
                  <input type="hidden" name="consorcioId" value={consorcioId} />
                  <input type="hidden" name="estado" value={ASAMBLEA_VOTACION_ESTADO.ABIERTA} />
                  <button type="submit" className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                    Abrir votacion
                  </button>
                </form>
                <form action={actualizarEstado}>
                  <input type="hidden" name="votacionId" value={votacion.id} />
                  <input type="hidden" name="consorcioId" value={consorcioId} />
                  <input type="hidden" name="estado" value={ASAMBLEA_VOTACION_ESTADO.CERRADA} />
                  <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Cerrar votacion
                  </button>
                </form>
                <form action={actualizarEstado}>
                  <input type="hidden" name="votacionId" value={votacion.id} />
                  <input type="hidden" name="consorcioId" value={consorcioId} />
                  <input type="hidden" name="estado" value={ASAMBLEA_VOTACION_ESTADO.BORRADOR} />
                  <button type="submit" className="rounded-md border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50">
                    Pasar a borrador
                  </button>
                </form>
              </div>
            ) : null}
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Tu voto</h2>
            <p className="mt-1 text-sm text-slate-500">Accion disponible para la persona autenticada asociada al consorcio.</p>

            {!currentPersona ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                Tu usuario no tiene una persona vinculada habilitada para votar en este consorcio.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p><strong>Persona:</strong> {formatPersonaNombre(currentPersona)}</p>
                  <p><strong>Unidades:</strong> {currentPersona.unidadesLabel}</p>
                  <p><strong>Estado actual:</strong> {votoPropio ? votoPropio.valor : "Pendiente"}</p>
                </div>

                {canReceiveVotes(votacion.estado) ? (
                  <div className="flex flex-wrap gap-3">
                    <form action={emitirVotoPropio}>
                      <input type="hidden" name="votacionId" value={votacion.id} />
                      <input type="hidden" name="consorcioId" value={consorcioId} />
                      <input type="hidden" name="valor" value={ASAMBLEA_VOTO_VALOR.POSITIVO} />
                      <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                        Votar positivo
                      </button>
                    </form>
                    <form action={emitirVotoPropio}>
                      <input type="hidden" name="votacionId" value={votacion.id} />
                      <input type="hidden" name="consorcioId" value={consorcioId} />
                      <input type="hidden" name="valor" value={ASAMBLEA_VOTO_VALOR.NEGATIVO} />
                      <button type="submit" className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
                        Votar negativo
                      </button>
                    </form>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                    La votacion no esta abierta en este momento.
                  </p>
                )}
              </div>
            )}
          </article>
        </div>

        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Personas del consorcio</h2>
              <p className="mt-1 text-sm text-slate-500">Estado del voto por persona y carga por administrador.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
              {personas.length}
            </span>
          </div>

          {personas.length === 0 ? (
            <p className="mt-5 rounded-lg border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
              No hay personas vigentes asociadas a unidades de este consorcio.
            </p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full border-collapse">
                  <thead className="bg-slate-50/80">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Persona</th>
                      <th className="px-4 py-3">Unidades</th>
                      <th className="px-4 py-3">Voto</th>
                      <th className="px-4 py-3">Registrado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-slate-800">
                    {personas.map((persona) => {
                      const voto = votosByPersona.get(persona.id) ?? null;

                      return (
                        <tr key={persona.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-900">{formatPersonaNombre(persona)}</p>
                            <p className="mt-1 text-xs text-slate-500">{persona.email ?? "Sin email"}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">{persona.unidadesLabel}</td>
                          <td className="px-4 py-4">
                            {voto ? (
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  voto.valor === ASAMBLEA_VOTO_VALOR.POSITIVO
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {voto.valor}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                Pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {voto ? (
                              <div className="space-y-1">
                                <p>{formatDateTime(voto.votadoAt)}</p>
                                <p className="text-xs">
                                  {voto.registradoPorAdministrador
                                    ? `Cargado por administrador${voto.registradoPorUser?.name ? ` (${voto.registradoPorUser.name})` : ""}`
                                    : "Emitido por la persona"}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">Sin voto registrado</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {canManage ? (
                              canReceiveVotes(votacion.estado) ? (
                                <div className="flex justify-end gap-2">
                                  <form action={registrarVotoAdministrador}>
                                    <input type="hidden" name="votacionId" value={votacion.id} />
                                    <input type="hidden" name="consorcioId" value={consorcioId} />
                                    <input type="hidden" name="personaId" value={persona.id} />
                                    <input type="hidden" name="valor" value={ASAMBLEA_VOTO_VALOR.POSITIVO} />
                                    <button type="submit" className="rounded-md border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                                      Registrar positivo
                                    </button>
                                  </form>
                                  <form action={registrarVotoAdministrador}>
                                    <input type="hidden" name="votacionId" value={votacion.id} />
                                    <input type="hidden" name="consorcioId" value={consorcioId} />
                                    <input type="hidden" name="personaId" value={persona.id} />
                                    <input type="hidden" name="valor" value={ASAMBLEA_VOTO_VALOR.NEGATIVO} />
                                    <button type="submit" className="rounded-md border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50">
                                      Registrar negativo
                                    </button>
                                  </form>
                                </div>
                              ) : (
                                <div className="text-right text-xs text-slate-500">Votacion cerrada</div>
                              )
                            ) : (
                              <div className="text-right text-xs text-slate-500">Sin permisos de carga</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
