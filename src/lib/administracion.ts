import "server-only";

import { Buffer } from "node:buffer";

import { sendEmail } from "./email";
import { buildEmailSummary, EMAIL_ESTADO, type EmailSummary } from "./email-tracking";
import { buildAdministradorFirmaPath } from "./asamblea-firma";
import { buildAsambleaConvocatoriaPreviewHtml } from "./asamblea-convocatoria-preview";
import { prisma } from "./prisma";
import { launchPdfBrowser } from "./pdf-browser";
import { ADMIN_EMAIL_TIPO_ENVIO, ASAMBLEA_ESTADO, ASAMBLEA_TIPO } from "./administracion-shared";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DEFAULT_PUBLIC_APP_URL = "https://app.amiconsorcio.com.ar";

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

type EmailAttachment = {
  content: Buffer;
  filename: string;
  contentType: string;
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

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}

function getPublicAppUrl() {
  const baseUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    DEFAULT_PUBLIC_APP_URL;

  return baseUrl.replace(/\/+$/, "");
}

function getArchivoUrl(rutaArchivo: string | null | undefined) {
  if (!rutaArchivo) {
    return null;
  }

  const baseUrl = getPublicAppUrl();
  return `${baseUrl}${rutaArchivo.startsWith("/") ? rutaArchivo : `/${rutaArchivo}`}`;
}

function buildTipoLabel(tipo: string) {
  return `PRIMERA ASAMBLEA ${tipo === ASAMBLEA_TIPO.EXTRAORDINARIA ? "EXTRAORDINARIA" : "ORDINARIA"}`;
}

function buildFirmaDataUrl(mimeType: string | null | undefined, contenido: Uint8Array | null | undefined) {
  if (!mimeType || !contenido) {
    return null;
  }

  return `data:${mimeType};base64,${Buffer.from(contenido).toString("base64")}`;
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

function mergeDestinatariosPorUnidad(destinatarios: UnidadDestinataria[]) {
  const grouped = new Map<number, UnidadDestinataria>();

  for (const destinatario of destinatarios) {
    const current = grouped.get(destinatario.unidadId);

    if (!current) {
      grouped.set(destinatario.unidadId, {
        ...destinatario,
        emails: Array.from(new Set(destinatario.emails)),
      });
      continue;
    }

    grouped.set(destinatario.unidadId, {
      unidadId: destinatario.unidadId,
      unidadLabel: current.unidadLabel || destinatario.unidadLabel,
      responsablesLabel:
        current.responsablesLabel === destinatario.responsablesLabel
          ? current.responsablesLabel
          : [current.responsablesLabel, destinatario.responsablesLabel].filter(Boolean).join(" / "),
      emails: Array.from(new Set([...current.emails, ...destinatario.emails])),
    });
  }

  return Array.from(grouped.values());
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
  attachments?: EmailAttachment[];
  afterSuccess?: () => Promise<void>;
}) {
  const results: Array<{ estado: string }> = [];
  const destinatariosAgrupados = mergeDestinatariosPorUnidad(params.destinatarios);

  for (const destinatario of destinatariosAgrupados) {
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
        attachments: params.attachments,
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

type AsambleaConvocatoriaRecord = Awaited<ReturnType<typeof getAsambleaConvocatoriaRecord>>;

async function getAsambleaConvocatoriaRecord(asambleaId: number) {
  return prisma.asamblea.findUnique({
    where: { id: asambleaId },
    select: {
      id: true,
      consorcioId: true,
      tipo: true,
      fecha: true,
      hora: true,
      lugar: true,
      convocatoriaTexto: true,
      observaciones: true,
      firmaMimeType: true,
      firmaContenido: true,
      firmaAclaracion: true,
      firmaRol: true,
      consorcio: {
        select: {
          nombre: true,
          tituloLegal: true,
          administradores: {
            where: {
              desde: { lte: new Date() },
              OR: [{ hasta: null }, { hasta: { gte: new Date() } }],
            },
            orderBy: [{ desde: "desc" }, { id: "desc" }],
            select: {
              id: true,
              firmaMimeType: true,
              firmaContenido: true,
              firmaAclaracion: true,
              firmaRol: true,
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
}

function buildConvocatoriaPdfHtml(asamblea: NonNullable<AsambleaConvocatoriaRecord>) {
  const administradorVigente = asamblea.consorcio.administradores.find(
    (relation) => relation.firmaContenido || relation.firmaAclaracion || relation.firmaRol,
  ) ?? asamblea.consorcio.administradores[0];

  const firmaMimeType = administradorVigente?.firmaMimeType ?? asamblea.firmaMimeType;
  const firmaContenido = administradorVigente?.firmaContenido ?? asamblea.firmaContenido;
  const firmaAclaracion =
    administradorVigente?.firmaAclaracion?.trim() ||
    (administradorVigente?.persona ? `${administradorVigente.persona.nombre} ${administradorVigente.persona.apellido}`.trim() : "") ||
    asamblea.firmaAclaracion ||
    undefined;
  const firmaRol = administradorVigente?.firmaRol?.trim() || asamblea.firmaRol || "Administrador";

  const html = buildAsambleaConvocatoriaPreviewHtml({
    consorcioNombre: asamblea.consorcio.nombre,
    consorcioNombreLegal: asamblea.consorcio.tituloLegal?.trim() || asamblea.consorcio.nombre,
    tipo: asamblea.tipo,
    fecha: asamblea.fecha.toISOString().slice(0, 10),
    hora: asamblea.hora,
    lugar: asamblea.lugar,
    observaciones: asamblea.observaciones ?? undefined,
    ordenDelDia: asamblea.ordenDia.map((item) => ({ titulo: item.titulo })),
    logoUrl: getArchivoUrl("/branding/logo-gray-v2.png") ?? "/branding/logo-gray-v2.png",
    firmaUrl:
      buildFirmaDataUrl(firmaMimeType, firmaContenido) ??
      (administradorVigente?.firmaContenido ? getArchivoUrl(buildAdministradorFirmaPath(administradorVigente.id)) : null),
    firmaAclaracion: firmaAclaracion || undefined,
    firmaRol: firmaRol || undefined,
  });

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Convocatoria a asamblea</title>
        <style>
          @page { size: A4; margin: 0; }
          html, body { margin: 0; padding: 0; background: #ffffff; }
          body { font-family: Arial, sans-serif; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `;
}

async function renderConvocatoriaPdfBuffer(asamblea: NonNullable<AsambleaConvocatoriaRecord>) {
  const browser = await launchPdfBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(buildConvocatoriaPdfHtml(asamblea), {
      waitUntil: "networkidle0",
    });

    return Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
      }),
    );
  } finally {
    await browser.close();
  }
}

export async function enviarConvocatoriaAsamblea(asambleaId: number): Promise<EmailSummary> {
  const asamblea = await getAsambleaConvocatoriaRecord(asambleaId);

  if (!asamblea) {
    throw new Error("asamblea_inexistente");
  }

  if (asamblea.ordenDia.length === 0) {
    throw new Error("asamblea_sin_orden");
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
  const pdfBuffer = await renderConvocatoriaPdfBuffer(asamblea);

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
    attachments: [
      {
        content: pdfBuffer,
        filename: `convocatoria-asamblea-${asamblea.id}.pdf`,
        contentType: "application/pdf",
      },
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

export async function enviarSimulacionConvocatoriaAsamblea(asambleaId: number): Promise<EmailSummary> {
  const asamblea = await getAsambleaConvocatoriaRecord(asambleaId);

  if (!asamblea) {
    throw new Error("asamblea_inexistente");
  }

  if (asamblea.ordenDia.length === 0) {
    throw new Error("asamblea_sin_orden");
  }

  const adminEmails = Array.from(
    new Set(
      asamblea.consorcio.administradores
        .map((relation) => normalizeEmail(relation.persona.email))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const administradorLabel =
    asamblea.consorcio.administradores
      .map((relation) => `${relation.persona.apellido}, ${relation.persona.nombre}`)
      .filter((value) => value.trim().length > 0)
      .join(" / ") || "Administrador del consorcio";

  if (adminEmails.length === 0) {
    await prisma.envioEmail.create({
      data: {
        consorcioId: asamblea.consorcioId,
        asambleaId: asamblea.id,
        tipoEnvio: ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_SIMULACION_ADMIN,
        destinatario: null,
        asunto: `Simulacion de convocatoria de asamblea - ${asamblea.consorcio.nombre}`,
        cuerpo:
          "No se pudo enviar la simulacion de convocatoria porque el consorcio no tiene un email de administrador vigente configurado.",
        estado: EMAIL_ESTADO.SIN_DESTINATARIO,
        errorMensaje: "El consorcio no tiene un email de administrador vigente configurado.",
      },
    });

    throw new Error("administrador_sin_email");
  }

  const asunto = `Simulacion de convocatoria de asamblea - ${asamblea.consorcio.nombre}`;
  const cuerpo = [
    "Adjuntamos una simulacion interna de la convocatoria de asamblea para revision previa.",
    "Este mensaje fue enviado solo al administrador del consorcio y no fue distribuido a propietarios ni responsables.",
    `Asamblea prevista: ${buildTipoLabel(asamblea.tipo)} del ${formatLongDate(asamblea.fecha)} a las ${asamblea.hora}.`,
  ].join("\n\n");

  const envio = await prisma.envioEmail.create({
    data: {
      consorcioId: asamblea.consorcioId,
      asambleaId: asamblea.id,
      tipoEnvio: ADMIN_EMAIL_TIPO_ENVIO.ASAMBLEA_SIMULACION_ADMIN,
      destinatario: adminEmails.join(", "),
      asunto,
      cuerpo,
      estado: EMAIL_ESTADO.PENDIENTE,
    },
    select: { id: true },
  });

  try {
    const pdfBuffer = await renderConvocatoriaPdfBuffer(asamblea);

    const response = await sendEmail({
      to: adminEmails,
      subject: asunto,
      html: buildEmailHtml({
        title: asunto,
        body: cuerpo,
        detailLines: [
          `Consorcio: ${asamblea.consorcio.nombre}`,
          `Administrador destinatario: ${administradorLabel}`,
          `Fecha: ${formatDate(asamblea.fecha)}`,
          `Hora: ${asamblea.hora}`,
          `Lugar: ${asamblea.lugar}`,
          "Tipo de envio: simulacion interna para revision",
        ],
      }),
      text: cuerpo,
      attachments: [
        {
          content: pdfBuffer,
          filename: `convocatoria-asamblea-${asamblea.id}.pdf`,
          contentType: "application/pdf",
        },
      ],
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

    return buildEmailSummary([{ estado: EMAIL_ESTADO.ENVIADO }]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.slice(0, 1000) : "Error desconocido al enviar email.";

    await prisma.envioEmail.update({
      where: { id: envio.id },
      data: {
        estado: EMAIL_ESTADO.ERROR,
        errorMensaje: errorMessage,
      },
    });

    throw error;
  }
}
