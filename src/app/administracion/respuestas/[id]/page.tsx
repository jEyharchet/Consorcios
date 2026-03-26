import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getActiveConsorcioContext } from "@/lib/consorcio-activo";
import { EMAIL_RESPUESTA_ESTADO, getRespuestaBodyText } from "@/lib/email-replies";
import { requireConsorcioRole } from "@/lib/auth";
import { redirectToOnboardingIfNoConsorcios } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

import { buildReturnQuery, formatDateTime } from "../../shared";

const MANAGEABLE_ESTADOS = [EMAIL_RESPUESTA_ESTADO.LEIDA, EMAIL_RESPUESTA_ESTADO.RESUELTA] as const;

function getFeedback(searchParams: { ok?: string; error?: string }) {
  switch (searchParams.ok) {
    case "estado_actualizado":
      return { type: "ok" as const, text: "El estado de la respuesta fue actualizado." };
    default:
      break;
  }

  switch (searchParams.error) {
    case "respuesta_invalida":
      return { type: "error" as const, text: "No se encontro la respuesta solicitada." };
    case "estado_invalido":
      return { type: "error" as const, text: "El estado solicitado no es valido." };
    default:
      return null;
  }
}

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

function buildContexto(item: {
  asamblea: { id: number; fecha: Date; tipo: string } | null;
  envioEmail: { id: number; tipoEnvio: string; asunto: string; liquidacionId: number | null } | null;
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
      label: `Liquidacion #${item.envioEmail.liquidacionId}`,
      href: `/liquidaciones/${item.envioEmail.liquidacionId}`,
    };
  }

  return null;
}

export default async function RespuestaEmailDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { ok?: string; error?: string };
}) {
  const respuestaId = Number(params.id);

  if (!Number.isInteger(respuestaId) || respuestaId <= 0) {
    notFound();
  }

  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  const respuesta = await prisma.respuestaEmail.findUnique({
    where: { id: respuestaId },
    include: {
      consorcio: {
        select: { id: true, nombre: true },
      },
      persona: {
        select: { id: true, nombre: true, apellido: true, email: true, telefono: true },
      },
      asamblea: {
        select: { id: true, fecha: true, tipo: true, lugar: true },
      },
      envioEmail: {
        select: {
          id: true,
          tipoEnvio: true,
          asunto: true,
          destinatario: true,
          providerMessageId: true,
          liquidacionId: true,
          enviadoAt: true,
        },
      },
    },
  });

  if (!respuesta) {
    notFound();
  }

  if (!access.isSuperAdmin && !access.allowedConsorcioIds.includes(respuesta.consorcioId)) {
    notFound();
  }

  if (activeConsorcioId && respuesta.consorcioId !== activeConsorcioId && !access.isSuperAdmin) {
    notFound();
  }

  async function actualizarEstado(formData: FormData) {
    "use server";

    const targetRespuestaId = Number(formData.get("respuestaId"));
    const estado = (formData.get("estado")?.toString() ?? "").trim();

    if (!Number.isInteger(targetRespuestaId) || targetRespuestaId <= 0) {
      redirect(`/administracion/respuestas/${params.id}${buildReturnQuery({ error: "respuesta_invalida" })}`);
    }

    if (!MANAGEABLE_ESTADOS.includes(estado as (typeof MANAGEABLE_ESTADOS)[number])) {
      redirect(`/administracion/respuestas/${params.id}${buildReturnQuery({ error: "estado_invalido" })}`);
    }

    const actual = await prisma.respuestaEmail.findUnique({
      where: { id: targetRespuestaId },
      select: { id: true, consorcioId: true },
    });

    if (!actual) {
      redirect(`/administracion/respuestas/${params.id}${buildReturnQuery({ error: "respuesta_invalida" })}`);
    }

    await requireConsorcioRole(actual.consorcioId, ["ADMIN", "OPERADOR"]);

    await prisma.respuestaEmail.update({
      where: { id: targetRespuestaId },
      data: { estado },
    });

    redirect(`/administracion/respuestas/${targetRespuestaId}${buildReturnQuery({ ok: "estado_actualizado" })}`);
  }

  const feedback = getFeedback(searchParams ?? {});
  const remitenteNombre =
    respuesta.fromNombre?.trim() ||
    (respuesta.persona ? `${respuesta.persona.apellido}, ${respuesta.persona.nombre}` : respuesta.fromEmail);
  const contexto = buildContexto({
    asamblea: respuesta.asamblea,
    envioEmail: respuesta.envioEmail,
  });
  const visibleBody = getRespuestaBodyText({
    bodyTexto: respuesta.bodyTexto,
    bodyHtml: respuesta.bodyHtml,
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/administracion/respuestas" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Volver a Respuestas
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{respuesta.subject}</h1>
          <p className="mt-1 text-sm text-slate-600">Respuesta recibida y asociada al consorcio {respuesta.consorcio.nombre}.</p>
        </div>

        <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${getEstadoBadgeClasses(respuesta.estado)}`}>
          {respuesta.estado}
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

      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Mensaje recibido</h2>
          <dl className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500">Fecha de recepcion</dt>
              <dd className="mt-1 text-slate-900">{formatDateTime(respuesta.receivedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Remitente</dt>
              <dd className="mt-1 text-slate-900">{remitenteNombre}</dd>
              <dd className="text-slate-500">{respuesta.fromEmail}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Para</dt>
              <dd className="mt-1 text-slate-900">{respuesta.toEmail || "No informado"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Asunto</dt>
              <dd className="mt-1 text-slate-900">{respuesta.subject}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Contenido</h3>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
              {visibleBody || "No se pudo extraer contenido legible del email recibido."}
            </pre>
          </div>

          {respuesta.bodyHtml ? (
            <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Ver HTML almacenado</summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                {respuesta.bodyHtml}
              </pre>
            </details>
          ) : null}
        </article>

        <aside className="space-y-6">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Gestion</h2>
            <div className="mt-4 flex flex-col gap-3">
              {respuesta.estado !== EMAIL_RESPUESTA_ESTADO.LEIDA ? (
                <form action={actualizarEstado}>
                  <input type="hidden" name="respuestaId" value={respuesta.id} />
                  <input type="hidden" name="estado" value={EMAIL_RESPUESTA_ESTADO.LEIDA} />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Marcar como leida
                  </button>
                </form>
              ) : null}

              {respuesta.estado !== EMAIL_RESPUESTA_ESTADO.RESUELTA ? (
                <form action={actualizarEstado}>
                  <input type="hidden" name="respuestaId" value={respuesta.id} />
                  <input type="hidden" name="estado" value={EMAIL_RESPUESTA_ESTADO.RESUELTA} />
                  <button
                    type="submit"
                    className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Marcar como resuelta
                  </button>
                </form>
              ) : null}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Asociaciones</h2>
            <dl className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <dt className="font-medium text-slate-500">Envio original</dt>
                <dd className="mt-1 text-slate-900">
                  {respuesta.envioEmail ? (
                    <>
                      <span>{respuesta.envioEmail.tipoEnvio.replaceAll("_", " ").toLowerCase()}</span>
                      <p className="mt-1 text-slate-500">{respuesta.envioEmail.asunto}</p>
                    </>
                  ) : (
                    "No asociado"
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Contexto relacionado</dt>
                <dd className="mt-1 text-slate-900">
                  {contexto?.href ? (
                    <Link href={contexto.href} className="font-medium text-slate-700 hover:text-slate-950">
                      {contexto.label}
                    </Link>
                  ) : (
                    contexto?.label || "Sin contexto asociado"
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Persona identificada</dt>
                <dd className="mt-1 text-slate-900">
                  {respuesta.persona ? (
                    <>
                      <Link href={`/personas/${respuesta.persona.id}`} className="font-medium text-slate-700 hover:text-slate-950">
                        {respuesta.persona.apellido}, {respuesta.persona.nombre}
                      </Link>
                      <p className="mt-1 text-slate-500">{respuesta.persona.email || "Sin email"}</p>
                    </>
                  ) : (
                    "No resuelta automaticamente"
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Cabeceras de asociacion</dt>
                <dd className="mt-1 break-all text-slate-900">
                  Message-ID: {respuesta.messageId || "No informado"}
                  <br />
                  In-Reply-To: {respuesta.inReplyTo || "No informado"}
                </dd>
              </div>
            </dl>
          </article>
        </aside>
      </section>
    </main>
  );
}
