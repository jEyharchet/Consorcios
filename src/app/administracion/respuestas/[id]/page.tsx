import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getActiveConsorcioContext } from "@/lib/consorcio-activo";
import { buildReplyToAddress, createEmailReplyKey, EMAIL_RESPUESTA_ESTADO, getRespuestaBodyText } from "@/lib/email-replies";
import { extractLatestReplyText } from "@/lib/email-reply-cleaning";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL_TIPO_ENVIO } from "@/lib/administracion-shared";
import { requireConsorcioRole } from "@/lib/auth";
import { EMAIL_ESTADO } from "@/lib/email-tracking";
import { EMAIL_TIPO_ENVIO } from "@/lib/liquidacion-email";
import { redirectToOnboardingIfNoConsorcios } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

import { buildReturnQuery, formatDate, formatDateTime } from "../../shared";
import RespuestaReplySection from "./RespuestaReplySection";
import ResponderQuickAction from "./ResponderQuickAction";

const MANAGEABLE_ESTADOS = [EMAIL_RESPUESTA_ESTADO.LEIDA, EMAIL_RESPUESTA_ESTADO.RESUELTA] as const;

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M1.75 10s2.75-5 8.25-5 8.25 5 8.25 5-2.75 5-8.25 5-8.25-5-8.25-5Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="m4.5 10.5 3.5 3.5 7-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function normalizeMessageHeader(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^<+|>+$/g, "") || null;
}

function ensureReplySubject(value: string) {
  const trimmed = value.trim() || "(sin asunto)";
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

function buildReplyReferences(values: Array<string | null | undefined>) {
  const normalized = values
    .map((value) => normalizeMessageHeader(value))
    .filter((value): value is string => Boolean(value));

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.map((value) => `<${value}>`).join(" ");
}

function getFeedback(searchParams: { ok?: string; error?: string }) {
  switch (searchParams.ok) {
    case "estado_actualizado":
      return { type: "ok" as const, text: "El estado de la respuesta fue actualizado." };
    case "respuesta_enviada":
      return { type: "ok" as const, text: "La respuesta fue enviada correctamente." };
    default:
      break;
  }

  switch (searchParams.error) {
    case "respuesta_invalida":
      return { type: "error" as const, text: "No se encontro la respuesta solicitada." };
    case "estado_invalido":
      return { type: "error" as const, text: "El estado solicitado no es valido." };
    case "respuesta_vacia":
      return { type: "error" as const, text: "Escribe un mensaje antes de enviar la respuesta." };
    case "envio_fallido":
      return { type: "error" as const, text: "No se pudo enviar la respuesta. Intenta nuevamente." };
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

function tipoEnvioLabel(tipoEnvio: string) {
  if (tipoEnvio === ADMIN_EMAIL_TIPO_ENVIO.COMUNICACION_LIBRE) {
    return "Comunicacion libre";
  }

  if (tipoEnvio === ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_CONVOCATORIA) {
    return "Convocatoria";
  }

  if (tipoEnvio === ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_CONVOCATORIA_SELECTIVA) {
    return "Convocatoria selectiva";
  }

  if (tipoEnvio === ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_SIMULACION_ADMIN) {
    return "Simulacion al administrador";
  }

  if (tipoEnvio === EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE) {
    return "Liquidacion";
  }

  if (tipoEnvio === EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO) {
    return "Recordatorio de deuda";
  }

  return tipoEnvio.replaceAll("_", " ").toLowerCase();
}

function buildRespuestaContexto(item: {
  asamblea: { id: number; fecha: Date; tipo: string } | null;
  envioEmail:
    | {
        id: number;
        tipoEnvio: string;
        asunto: string;
        liquidacionId: number | null;
        unidad: { id: number; identificador: string; tipo: string } | null;
        liquidacion: { id: number; periodo: string } | null;
        asamblea: { id: number; fecha: Date; tipo: string } | null;
      }
    | null;
}) {
  if (item.envioEmail?.asamblea) {
    return {
      categoria: "Convocatoria",
      label: `Asamblea ${item.envioEmail.asamblea.tipo.toLowerCase()} del ${formatDate(item.envioEmail.asamblea.fecha)}`,
      href: `/administracion/asambleas/${item.envioEmail.asamblea.id}`,
    };
  }

  if (item.asamblea) {
    return {
      categoria: "Asamblea",
      label: `Asamblea ${item.asamblea.tipo.toLowerCase()} del ${formatDate(item.asamblea.fecha)}`,
      href: `/administracion/asambleas/${item.asamblea.id}`,
    };
  }

  if (item.envioEmail?.liquidacion) {
    return {
      categoria:
        item.envioEmail.tipoEnvio === EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO ? "Deuda" : "Liquidacion",
      label: `Liquidacion ${item.envioEmail.liquidacion.periodo}`,
      href: `/liquidaciones/${item.envioEmail.liquidacion.id}`,
    };
  }

  if (item.envioEmail?.tipoEnvio === ADMIN_EMAIL_TIPO_ENVIO.COMUNICACION_LIBRE) {
    return {
      categoria: "Comunicacion",
      label: "Comunicacion institucional",
      href: "/administracion/comunicaciones",
    };
  }

  return item.envioEmail
    ? {
        categoria: "Envio",
        label: tipoEnvioLabel(item.envioEmail.tipoEnvio),
        href: null,
      }
    : null;
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
  const now = new Date();

  const respuesta = await prisma.respuestaEmail.findUnique({
    where: { id: respuestaId },
    include: {
      consorcio: {
        select: { id: true, nombre: true },
      },
      persona: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          email: true,
          telefono: true,
          unidades: {
            where: {
              desde: { lte: now },
              OR: [{ hasta: null }, { hasta: { gte: now } }],
            },
            orderBy: [{ desde: "desc" }, { id: "desc" }],
            select: {
              id: true,
              desde: true,
              hasta: true,
              unidad: {
                select: {
                  id: true,
                  identificador: true,
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
          consorciosAdministrados: {
            where: {
              desde: { lte: now },
              OR: [{ hasta: null }, { hasta: { gte: now } }],
            },
            orderBy: [{ desde: "desc" }, { id: "desc" }],
            select: {
              id: true,
              desde: true,
              hasta: true,
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
          createdAt: true,
          consorcio: {
            select: {
              id: true,
              nombre: true,
            },
          },
          unidad: {
            select: {
              id: true,
              identificador: true,
              tipo: true,
            },
          },
          liquidacion: {
            select: {
              id: true,
              periodo: true,
            },
          },
          asamblea: {
            select: {
              id: true,
              fecha: true,
              tipo: true,
            },
          },
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

  async function enviarRespuesta(formData: FormData) {
    "use server";

    const targetRespuestaId = Number(formData.get("respuestaId"));
    const bodyHtml = formData.get("bodyHtml")?.toString().trim() ?? "";
    const bodyText = formData.get("bodyText")?.toString().trim() ?? "";

    if (!Number.isInteger(targetRespuestaId) || targetRespuestaId <= 0) {
      redirect(`/administracion/respuestas/${params.id}${buildReturnQuery({ error: "respuesta_invalida" })}`);
    }

    if (!bodyText) {
      redirect(`/administracion/respuestas/${targetRespuestaId}${buildReturnQuery({ error: "respuesta_vacia" })}`);
    }

    const actual = await prisma.respuestaEmail.findUnique({
      where: { id: targetRespuestaId },
      select: {
        id: true,
        consorcioId: true,
        asambleaId: true,
        fromEmail: true,
        messageId: true,
        inReplyTo: true,
        subject: true,
        envioEmail: {
          select: {
            id: true,
            tipoEnvio: true,
            liquidacionId: true,
            asambleaId: true,
            unidadId: true,
          },
        },
      },
    });

    if (!actual) {
      redirect(`/administracion/respuestas/${params.id}${buildReturnQuery({ error: "respuesta_invalida" })}`);
    }

    await requireConsorcioRole(actual.consorcioId, ["ADMIN", "OPERADOR"]);

    const asunto = ensureReplySubject(actual.subject);
    const inReplyToHeader = normalizeMessageHeader(actual.messageId);
    const referencesHeader = buildReplyReferences([actual.inReplyTo, actual.messageId]);
    const replyKey = createEmailReplyKey();
    const envio = await prisma.envioEmail.create({
      data: {
        consorcioId: actual.consorcioId,
        tipoEnvio: actual.envioEmail?.tipoEnvio ?? "RESPUESTA_ADMIN",
        liquidacionId: actual.envioEmail?.liquidacionId ?? null,
        asambleaId: actual.envioEmail?.asambleaId ?? actual.asambleaId ?? null,
        unidadId: actual.envioEmail?.unidadId ?? null,
        destinatario: actual.fromEmail,
        asunto,
        cuerpo: bodyText,
        estado: EMAIL_ESTADO.PENDIENTE,
        replyKey,
      },
      select: { id: true, replyKey: true },
    });

    try {
      const response = await sendEmail({
        to: actual.fromEmail,
        subject: asunto,
        html: bodyHtml || bodyText.replace(/\n/g, "<br />"),
        text: bodyText,
        replyTo: buildReplyToAddress(envio.replyKey) ?? undefined,
        headers: {
          ...(inReplyToHeader ? { "In-Reply-To": `<${inReplyToHeader}>` } : {}),
          ...(referencesHeader ? { References: referencesHeader } : {}),
        },
      });

      await prisma.envioEmail.update({
        where: { id: envio.id },
        data: {
          estado: EMAIL_ESTADO.ENVIADO,
          providerMessageId: response?.id ?? null,
          errorMensaje: null,
          enviadoAt: new Date(),
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message.slice(0, 1000) : "Error desconocido al enviar la respuesta.";

      await prisma.envioEmail.update({
        where: { id: envio.id },
        data: {
          estado: EMAIL_ESTADO.ERROR,
          errorMensaje: errorMessage,
        },
      });

      redirect(`/administracion/respuestas/${targetRespuestaId}${buildReturnQuery({ error: "envio_fallido" })}`);
    }

    redirect(`/administracion/respuestas/${targetRespuestaId}${buildReturnQuery({ ok: "respuesta_enviada" })}`);
  }

  const feedback = getFeedback(searchParams ?? {});
  const remitenteNombre =
    respuesta.fromNombre?.trim() ||
    (respuesta.persona ? `${respuesta.persona.apellido}, ${respuesta.persona.nombre}` : respuesta.fromEmail);
  const contexto = buildRespuestaContexto({
    asamblea: respuesta.asamblea,
    envioEmail: respuesta.envioEmail,
  });
  const receivedBody = getRespuestaBodyText({
    bodyTexto: respuesta.bodyTexto,
    bodyHtml: respuesta.bodyHtml,
  });
  const latestReplyText = extractLatestReplyText(receivedBody);
  const personaNombreCompleto = respuesta.persona
    ? `${respuesta.persona.apellido}, ${respuesta.persona.nombre}`
    : null;
  const unidadesVigentes = respuesta.persona?.unidades ?? [];
  const consorcioMap = new Map<number, { id: number; nombre: string; origenes: string[] }>();

  for (const relacion of unidadesVigentes) {
    const current = consorcioMap.get(relacion.unidad.consorcio.id);

    if (!current) {
      consorcioMap.set(relacion.unidad.consorcio.id, {
        id: relacion.unidad.consorcio.id,
        nombre: relacion.unidad.consorcio.nombre,
        origenes: ["Unidad vigente"],
      });
      continue;
    }

    if (!current.origenes.includes("Unidad vigente")) {
      current.origenes.push("Unidad vigente");
    }
  }

  for (const relacion of respuesta.persona?.consorciosAdministrados ?? []) {
    const current = consorcioMap.get(relacion.consorcio.id);

    if (!current) {
      consorcioMap.set(relacion.consorcio.id, {
        id: relacion.consorcio.id,
        nombre: relacion.consorcio.nombre,
        origenes: ["Administrador vigente"],
      });
      continue;
    }

    if (!current.origenes.includes("Administrador vigente")) {
      current.origenes.push("Administrador vigente");
    }
  }

  const consorciosRelacionados = Array.from(consorcioMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const fechaEnvioOriginal = respuesta.envioEmail?.enviadoAt ?? respuesta.envioEmail?.createdAt ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/administracion/respuestas" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Volver a Respuestas
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{respuesta.subject}</h1>
          <p className="mt-1 text-sm text-slate-600">Respuesta recibida y asociada al consorcio {respuesta.consorcio.nombre}.</p>
        </div>

        <div className="flex flex-col items-end">
          <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${getEstadoBadgeClasses(respuesta.estado)}`}>
            {respuesta.estado}
          </span>

          <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
            <form action={actualizarEstado}>
              <input type="hidden" name="respuestaId" value={respuesta.id} />
              <input type="hidden" name="estado" value={EMAIL_RESPUESTA_ESTADO.LEIDA} />
              <button
                type="submit"
                aria-label="Marcar como leída"
                title="Marcar como leída"
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-xl transition ${
                  respuesta.estado === EMAIL_RESPUESTA_ESTADO.LEIDA || respuesta.estado === EMAIL_RESPUESTA_ESTADO.RESUELTA
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <EyeIcon />
              </button>
            </form>

            <form action={actualizarEstado}>
              <input type="hidden" name="respuestaId" value={respuesta.id} />
              <input type="hidden" name="estado" value={EMAIL_RESPUESTA_ESTADO.RESUELTA} />
              <button
                type="submit"
                aria-label="Marcar como resuelta"
                title="Marcar como resuelta"
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-xl transition ${
                  respuesta.estado === EMAIL_RESPUESTA_ESTADO.RESUELTA
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <CheckIcon />
              </button>
            </form>

            <ResponderQuickAction />
          </div>
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

      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Mensaje recibido</h2>
          <dl className="mt-4 grid gap-x-5 gap-y-3 text-sm text-slate-600 sm:grid-cols-3">
            <div>
              <dt className="font-medium text-slate-500">Fecha de recepcion</dt>
              <dd className="mt-1 leading-5 text-slate-900">{formatDateTime(respuesta.receivedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Remitente</dt>
              <dd className="mt-1 leading-5 text-slate-900">{remitenteNombre}</dd>
              <dd className="leading-5 text-slate-500">{respuesta.fromEmail}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Asunto</dt>
              <dd className="mt-1 leading-5 text-slate-900">{respuesta.subject}</dd>
            </div>
          </dl>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Responde a</h3>
            <dl className="mt-3 grid gap-x-5 gap-y-3 text-sm text-slate-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500">Tipo / contexto</dt>
                <dd className="mt-1 text-slate-900">
                  {contexto ? `${contexto.categoria}: ${contexto.label}` : respuesta.envioEmail ? tipoEnvioLabel(respuesta.envioEmail.tipoEnvio) : "No asociado"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Asunto original</dt>
                <dd className="mt-1 text-slate-900">{respuesta.envioEmail?.asunto || "No asociado"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Fecha del envio</dt>
                <dd className="mt-1 text-slate-900">{fechaEnvioOriginal ? formatDateTime(fechaEnvioOriginal) : "No disponible"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Consorcio y unidad</dt>
                <dd className="mt-1 text-slate-900">
                  {respuesta.envioEmail?.consorcio ? respuesta.envioEmail.consorcio.nombre : respuesta.consorcio.nombre}
                  {respuesta.envioEmail?.unidad ? ` / ${respuesta.envioEmail.unidad.identificador} (${respuesta.envioEmail.unidad.tipo})` : ""}
                </dd>
              </div>
              {contexto?.href ? (
                <div className="sm:col-span-2">
                  <dt className="font-medium text-slate-500">Acceso relacionado</dt>
                  <dd className="mt-1">
                    <Link href={contexto.href} className="font-medium text-slate-700 hover:text-slate-950">
                      Ir a {contexto.categoria.toLowerCase()}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>

          </div>

          <RespuestaReplySection
            receivedBody={receivedBody}
            latestReplyText={latestReplyText}
            respuestaId={respuesta.id}
            sendAction={enviarRespuesta}
          />

        </article>

        <aside className="space-y-6">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Persona</h2>
            <div className="mt-4 text-sm text-slate-600">
              {respuesta.persona ? (
                <div className="space-y-2">
                  <Link href={`/personas/${respuesta.persona.id}`} className="text-base font-semibold text-slate-900 hover:text-slate-700">
                    {personaNombreCompleto}
                  </Link>
                  <p>{respuesta.persona.email || "Sin email"}</p>
                  {respuesta.persona.telefono ? <p>Telefono: {respuesta.persona.telefono}</p> : null}
                </div>
              ) : (
                <p>No se identifico una Persona del sistema para este remitente.</p>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Unidades</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {unidadesVigentes.length > 0 ? (
                unidadesVigentes.map((relacion) => (
                  <div key={relacion.id} className="rounded-xl border border-slate-200 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/unidades/${relacion.unidad.id}`} className="font-semibold text-slate-900 hover:text-slate-700">
                          {relacion.unidad.identificador} ({relacion.unidad.tipo})
                        </Link>
                        <p className="mt-1 text-slate-500">{relacion.unidad.consorcio.nombre}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        Unidad vigente
                      </span>
                    </div>
                    <p className="mt-2 text-slate-500">Vinculo desde {formatDate(relacion.desde)}</p>
                  </div>
                ))
              ) : (
                <p>No hay unidades vigentes asociadas a la Persona identificada.</p>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Consorcios</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {consorciosRelacionados.length > 0 ? (
                consorciosRelacionados.map((consorcio) => (
                  <div key={consorcio.id} className="rounded-xl border border-slate-200 px-4 py-3">
                    <Link href={`/consorcios/${consorcio.id}`} className="font-semibold text-slate-900 hover:text-slate-700">
                      {consorcio.nombre}
                    </Link>
                    <p className="mt-1 text-slate-500">{consorcio.origenes.join(" / ")}</p>
                  </div>
                ))
              ) : (
                <p>No hay consorcios vigentes relacionados a la Persona identificada.</p>
              )}
            </div>
          </article>

        </aside>
      </section>
    </main>
  );
}
