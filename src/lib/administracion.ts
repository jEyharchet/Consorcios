import "server-only";

import { sendEmail } from "./email";
import { buildEmailSummary, EMAIL_ESTADO, type EmailSummary } from "./email-tracking";
import { prisma } from "./prisma";
import { ADMIN_EMAIL_TIPO_ENVIO, ASAMBLEA_ESTADO, ASAMBLEA_TIPO } from "./administracion-shared";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type ResponsableRelacion = {
  desde: Date;
  hasta: Date | null;
  persona: {
    id: number;
    nombre: string;
    apellido: string;
    email: string | null;
  };
};

type UnidadDestinataria = {
  unidadId: number;
  unidadLabel: string;
  responsablesLabel: string;
  emails: string[];
};

function normalizeEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? "";
  return EMAIL_REGEX.test(value) ? value : null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toHtmlParagraphs(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function resolveBaseResponsables(relaciones: ResponsableRelacion[]) {
  if (relaciones.length === 0) {
    return [] as ResponsableRelacion[];
  }

  const now = new Date();
  const vigentes = relaciones.filter((rel) => rel.desde <= now && (!rel.hasta || rel.hasta >= now));
  return vigentes.length > 0 ? vigentes : [relaciones[0]];
}

function resolveDestinatarios(relaciones: ResponsableRelacion[]) {
  const base = resolveBaseResponsables(relaciones);

  return {
    emails: Array.from(
      new Set(
        base.map((rel) => normalizeEmail(rel.persona.email)).filter((value): value is string => Boolean(value)),
      ),
    ),
    responsablesLabel:
      base.length > 0
        ? base.map((rel) => `${rel.persona.apellido}, ${rel.persona.nombre}`).join(" / ")
        : "Sin responsable",
  };
}

function applyPlaceholders(template: string, params: Record<string, string>) {
  return template.replace(/\{\{\s*(responsable|unidad|consorcio)\s*\}\}/gi, (match, key: string) => {
    const normalized = key.toLowerCase();
    if (normalized in params) {
      return params[normalized] ?? "";
    }

    return match;
  });
}

function buildEmailHtml(params: { title: string; body: string; detailLines?: string[] }) {
  const details =
    params.detailLines && params.detailLines.length > 0
      ? `<div style="margin-top:20px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:16px">${params.detailLines
          .map((line) => `<p style="margin:0 0 8px;color:#334155">${escapeHtml(line)}</p>`)
          .join("")}</div>`
      : "";

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
      <div style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#64748b">AMICONSORCIO</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">${escapeHtml(params.title)}</h1>
        <div style="color:#334155;line-height:1.6">${toHtmlParagraphs(params.body)}</div>
        ${details}
      </div>
    </div>
  `;
}

async function getDestinatariosConsorcio(consorcioId: number, unidadIds?: number[]) {
  const unidades = await prisma.unidad.findMany({
    where: {
      consorcioId,
      ...(unidadIds && unidadIds.length > 0 ? { id: { in: unidadIds } } : {}),
    },
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
              id: true,
              nombre: true,
              apellido: true,
              email: true,
            },
          },
        },
      },
    },
  });

  return unidades.map((unidad): UnidadDestinataria => {
    const destinatarios = resolveDestinatarios(unidad.personas);

    return {
      unidadId: unidad.id,
      unidadLabel: `${unidad.identificador} (${unidad.tipo})`,
      responsablesLabel: destinatarios.responsablesLabel,
      emails: destinatarios.emails,
    };
  });
}

async function registrarYEnviar(params: {
  consorcioId: number;
  consorcioNombre: string;
  tipoEnvio: string;
  asuntoTemplate: string;
  cuerpoTemplate: string;
  destinatarios: UnidadDestinataria[];
  asambleaId?: number;
  detailLines?: string[];
  afterSuccess?: () => Promise<void>;
}) {
  const results: Array<{ estado: string }> = [];

  for (const destinatario of params.destinatarios) {
    const placeholders = {
      responsable: destinatario.responsablesLabel,
      unidad: destinatario.unidadLabel,
      consorcio: params.consorcioNombre,
    };

    const asunto = applyPlaceholders(params.asuntoTemplate, placeholders);
    const cuerpo = applyPlaceholders(params.cuerpoTemplate, placeholders);

    if (destinatario.emails.length === 0) {
      await prisma.envioEmail.create({
        data: {
          consorcioId: params.consorcioId,
          asambleaId: params.asambleaId ?? null,
          tipoEnvio: params.tipoEnvio,
          unidadId: destinatario.unidadId,
          destinatario: null,
          asunto,
          cuerpo,
          estado: EMAIL_ESTADO.SIN_DESTINATARIO,
          errorMensaje: "No se encontro un email valido para los responsables vigentes de la unidad.",
        },
      });
      results.push({ estado: EMAIL_ESTADO.SIN_DESTINATARIO });
      continue;
    }

    const envio = await prisma.envioEmail.create({
      data: {
        consorcioId: params.consorcioId,
        asambleaId: params.asambleaId ?? null,
        tipoEnvio: params.tipoEnvio,
        unidadId: destinatario.unidadId,
        destinatario: destinatario.emails.join(", "),
        asunto,
        cuerpo,
        estado: EMAIL_ESTADO.PENDIENTE,
      },
      select: { id: true },
    });

    try {
      const response = await sendEmail({
        to: destinatario.emails,
        subject: asunto,
        html: buildEmailHtml({
          title: asunto,
          body: cuerpo,
          detailLines: params.detailLines,
        }),
        text: cuerpo,
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

      results.push({ estado: EMAIL_ESTADO.ENVIADO });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.slice(0, 1000) : "Error desconocido al enviar email.";

      await prisma.envioEmail.update({
        where: { id: envio.id },
        data: {
          estado: EMAIL_ESTADO.ERROR,
          errorMensaje: errorMessage,
        },
      });

      results.push({ estado: EMAIL_ESTADO.ERROR });
    }
  }

  if (params.afterSuccess) {
    await params.afterSuccess();
  }

  return buildEmailSummary(results);
}

export async function enviarComunicacionConsorcio(params: {
  consorcioId: number;
  asunto: string;
  cuerpo: string;
  unidadIds?: number[];
}): Promise<EmailSummary> {
  const consorcio = await prisma.consorcio.findUnique({
    where: { id: params.consorcioId },
    select: { id: true, nombre: true },
  });

  if (!consorcio) {
    throw new Error("consorcio_inexistente");
  }

  const destinatarios = await getDestinatariosConsorcio(params.consorcioId, params.unidadIds);

  return registrarYEnviar({
    consorcioId: params.consorcioId,
    consorcioNombre: consorcio.nombre,
    tipoEnvio: ADMIN_EMAIL_TIPO_ENVIO.COMUNICACION_LIBRE,
    asuntoTemplate: params.asunto,
    cuerpoTemplate: params.cuerpo,
    destinatarios,
  });
}

function buildConvocatoriaTexto(params: {
  consorcioNombre: string;
  tipo: string;
  fecha: Date;
  hora: string;
  lugar: string;
  convocatoriaTexto: string | null;
  ordenDelDia: Array<{ orden: number; titulo: string; descripcion: string | null }>;
}) {
  const encabezado = params.convocatoriaTexto?.trim()
    ? params.convocatoriaTexto.trim()
    : `Se convoca a asamblea ${params.tipo.toLowerCase()} del consorcio {{consorcio}} para el dia ${formatDate(params.fecha)} a las ${params.hora} en ${params.lugar}.`;

  const ordenDelDia = params.ordenDelDia.length
    ? `\n\nOrden del dia:\n${params.ordenDelDia
        .map((item) => `${item.orden}. ${item.titulo}${item.descripcion ? ` - ${item.descripcion}` : ""}`)
        .join("\n")}`
    : "\n\nOrden del dia pendiente de carga.";

  return `${encabezado}${ordenDelDia}`;
}

export async function enviarConvocatoriaAsamblea(asambleaId: number): Promise<EmailSummary> {
  const asamblea = await prisma.asamblea.findUnique({
    where: { id: asambleaId },
    select: {
      id: true,
      consorcioId: true,
      tipo: true,
      fecha: true,
      hora: true,
      lugar: true,
      convocatoriaTexto: true,
      consorcio: {
        select: {
          nombre: true,
        },
      },
      ordenDia: {
        orderBy: [{ orden: "asc" }, { id: "asc" }],
        select: {
          orden: true,
          titulo: true,
          descripcion: true,
        },
      },
    },
  });

  if (!asamblea) {
    throw new Error("asamblea_inexistente");
  }

  const cuerpo = buildConvocatoriaTexto({
    consorcioNombre: asamblea.consorcio.nombre,
    tipo: asamblea.tipo,
    fecha: asamblea.fecha,
    hora: asamblea.hora,
    lugar: asamblea.lugar,
    convocatoriaTexto: asamblea.convocatoriaTexto,
    ordenDelDia: asamblea.ordenDia,
  });

  const destinatarios = await getDestinatariosConsorcio(asamblea.consorcioId);

  return registrarYEnviar({
    consorcioId: asamblea.consorcioId,
    consorcioNombre: asamblea.consorcio.nombre,
    asambleaId: asamblea.id,
    tipoEnvio: ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_CONVOCATORIA,
    asuntoTemplate: `Convocatoria a asamblea ${asamblea.tipo.toLowerCase()} - {{consorcio}}`,
    cuerpoTemplate: cuerpo,
    destinatarios,
    detailLines: [
      `Consorcio: ${asamblea.consorcio.nombre}`,
      `Fecha: ${formatDate(asamblea.fecha)}`,
      `Hora: ${asamblea.hora}`,
      `Lugar: ${asamblea.lugar}`,
    ],
    afterSuccess: async () => {
      await prisma.asamblea.update({
        where: { id: asamblea.id },
        data: {
          estado: asamblea.ordenDia.length > 0 ? ASAMBLEA_ESTADO.CONVOCADA : undefined,
        },
      });
    },
  });
}
