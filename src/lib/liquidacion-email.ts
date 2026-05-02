import path from "path";
import { readFile } from "fs/promises";

import { sendEmail } from "./email";
import { buildEmailSummary, EMAIL_ESTADO, formatEmailSummary, type EmailSummary } from "./email-tracking";
import { buildReplyToAddress, createEmailReplyKey } from "./email-replies";
import { prisma } from "./prisma";
import {
  filterRelacionesUnidadPorTipos,
  filterRelacionesUnidadVigentesPorTipos,
  getTiposRelacionParaBoletaPago,
  getTiposRelacionParaNotificacionGeneral,
} from "./unidad-relacion";

export { formatEmailSummary } from "./email-tracking";

export type LiquidacionEmailTraceItem = {
  estado: string;
  destinatario: string | null;
  destinatarioNombre: string;
  unidadesIncluidas: string;
  asunto: string;
  errorMensaje: string | null;
};

export type LiquidacionEmailProgress = {
  total: number;
  processed: number;
  enviados: number;
  fallidos: number;
  sinDestinatario: number;
  ultimoError: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DEFAULT_PUBLIC_APP_URL = "https://app.amiconsorcio.com.ar";

export const EMAIL_TIPO_ENVIO = {
  LIQUIDACION_CIERRE: "LIQUIDACION_CIERRE",
  RECORDATORIO_VENCIMIENTO: "RECORDATORIO_VENCIMIENTO",
} as const;

type TipoEnvioEmail = (typeof EMAIL_TIPO_ENVIO)[keyof typeof EMAIL_TIPO_ENVIO];

type ResponsableRelacion = {
  desde: Date;
  hasta: Date | null;
  tipoRelacion?: string | null;
  persona: {
    id: number;
    nombre: string;
    apellido: string;
    email: string | null;
  };
};

type CuentaPago = {
  banco: string;
  titular: string;
  cbu: string;
  alias: string | null;
  cuitTitular: string | null;
};

export type ReminderDraft = {
  unidadId: number;
  unidadIdsCsv: string;
  unidadLabel: string;
  unidadCount: number;
  responsablesLabel: string;
  responsableIdsCsv: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  saldoPendiente: number;
  boletaArchivoId: number | null;
  boletaNombre: string | null;
  tieneBoletaAdjunta: boolean;
};

export type LiquidacionClosureDraft = {
  unidadId: number;
  unidadIdsCsv: string;
  unidadLabel: string;
  unidadCount: number;
  responsablesLabel: string;
  responsableIdsCsv: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  importeLiquidado: number;
  boletaArchivoId: number | null;
  boletaNombre: string | null;
  tieneBoletaAdjunta: boolean;
  rendicionUrl: string | null;
  ultimoEstado: "ENVIADO" | "ERROR" | "SIN_ENVIO" | "SIN_DESTINATARIO";
  ultimoError: string | null;
};

type ReminderDraftInput = {
  unidadId: number;
  unidadIdsCsv: string;
  unidadCount: number;
  unidadLabel: string;
  responsablesLabel: string;
  responsableIdsCsv: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  saldoPendiente: number;
  boletaArchivoId: number | null;
};

type LiquidacionClosureDraftInput = {
  unidadId: number;
  unidadIdsCsv: string;
  unidadCount: number;
  unidadLabel: string;
  responsablesLabel: string;
  responsableIdsCsv: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  importeLiquidado: number;
  boletaArchivoId: number | null;
};

type ReminderEmailRenderParams = {
  subject?: string;
  consorcioNombre: string;
  periodo: string;
  unidadLabel: string;
  unidadCount: number;
  responsablesLabel: string;
  fechaVencimiento: Date | null;
  montoPendiente: number;
  mensajeEditable: string;
  cuentaPago: CuentaPago | null;
};

type LiquidacionEmailExpensa = {
  id: number;
  monto: number;
  saldo: number;
  unidadId: number;
  unidad: {
    identificador: string;
    tipo: string;
    personas: ResponsableRelacion[];
  };
};

type LiquidacionEmailArchivo = {
  id: number;
  tipoArchivo: string;
  nombreArchivo: string;
  rutaArchivo: string;
  mimeType: string;
  responsableGroupKey: string | null;
};

type LiquidacionEmailGroup = {
  key: string;
  primaryUnidadId: number;
  unidadIds: number[];
  unidadCount: number;
  unidadesLabel: string;
  responsableIds: number[];
  responsablesLabel: string;
  destinatarios: string[];
  montoTotal: number;
  saldoTotal: number;
  boletaArchivo: LiquidacionEmailArchivo | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function normalizeEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? "";
  return EMAIL_REGEX.test(value) ? value : null;
}

function extractEmailErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const maybeError = error as Error & {
      statusCode?: number;
      name?: string;
      message?: string;
      response?: { data?: unknown; error?: unknown };
    };

    const parts = [
      maybeError.name && maybeError.name !== "Error" ? maybeError.name : null,
      maybeError.statusCode ? `status ${maybeError.statusCode}` : null,
      maybeError.message ?? null,
    ].filter((value): value is string => Boolean(value));

    const responsePayload =
      maybeError.response && typeof maybeError.response === "object"
        ? (maybeError.response.data ?? maybeError.response.error ?? null)
        : null;

    if (responsePayload) {
      const responseText =
        typeof responsePayload === "string" ? responsePayload : JSON.stringify(responsePayload).slice(0, 500);
      parts.push(responseText);
    }

    return parts.join(" - ").slice(0, 1000) || "Error desconocido al enviar email.";
  }

  if (typeof error === "string") {
    return error.slice(0, 1000);
  }

  try {
    return JSON.stringify(error).slice(0, 1000);
  } catch {
    return "Error desconocido al enviar email.";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatPeriodoLabel(periodo: string) {
  const [year, month] = periodo.split("-");
  if (!year || !month) return periodo;

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, 1));
}

function buildUnidadLabel(unidad: { identificador: string; tipo: string }) {
  return `${unidad.identificador} (${unidad.tipo})`;
}

function resolveBaseResponsables(relaciones: ResponsableRelacion[], tipos: string[]) {
  if (relaciones.length === 0) {
    return [] as ResponsableRelacion[];
  }

  const vigentes = filterRelacionesUnidadVigentesPorTipos(relaciones, tipos);
  if (vigentes.length > 0) {
    return vigentes;
  }

  const filtradas = filterRelacionesUnidadPorTipos(relaciones, tipos);
  return filtradas.length > 0 ? [filtradas[0]] : [];
}

function buildResponsableGroupKey(relaciones: ResponsableRelacion[]) {
  const base = resolveBaseResponsables(relaciones, getTiposRelacionParaBoletaPago());

  if (base.length === 0) {
    return "fallback-sin-responsable";
  }

  const responsables = base
    .map((rel) => ({
      id: rel.persona.id,
      label: `${rel.persona.apellido}, ${rel.persona.nombre}`,
    }))
    .sort((a, b) => a.id - b.id || a.label.localeCompare(b.label, "es"));

  const ids = responsables.map((responsable) => responsable.id).filter((value) => value > 0);

  if (ids.length > 0) {
    return ids.join("|");
  }

  return `fallback-${slugify(responsables.map((responsable) => responsable.label).join("-"))}`;
}

function resolveDestinatarios(relaciones: ResponsableRelacion[], tipos: string[]) {
  const base = resolveBaseResponsables(relaciones, tipos);
  const emails = Array.from(
    new Set(
      base
        .map((rel) => normalizeEmail(rel.persona.email))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  return {
    emails,
    responsablesLabel:
      base.length > 0
        ? base.map((rel) => `${rel.persona.apellido}, ${rel.persona.nombre}`).join(" / ")
        : "Sin responsable",
  };
}

function resolveDestinatariosGenerales(relaciones: ResponsableRelacion[]) {
  return resolveDestinatarios(relaciones, getTiposRelacionParaNotificacionGeneral());
}

function resolveDestinatariosBoleta(relaciones: ResponsableRelacion[]) {
  return resolveDestinatarios(relaciones, getTiposRelacionParaBoletaPago());
}

function buildLiquidacionEmailGroups(params: {
  expensas: LiquidacionEmailExpensa[];
  archivos: LiquidacionEmailArchivo[];
  tipoEnvio: TipoEnvioEmail;
}): LiquidacionEmailGroup[] {
  const groups = new Map<
    string,
    {
      key: string;
      primaryUnidadId: number;
      unidadIds: number[];
      unidades: string[];
      responsableIds: number[];
      responsablesLabel: string;
      destinatarios: string[];
      montoTotal: number;
      saldoTotal: number;
    }
  >();

  for (const expensa of params.expensas) {
    const key = buildResponsableGroupKey(expensa.unidad.personas);
    const destinatarios =
      params.tipoEnvio === EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO
        ? resolveDestinatariosBoleta(expensa.unidad.personas)
        : resolveDestinatariosGenerales(expensa.unidad.personas);
    const unidadLabel = buildUnidadLabel(expensa.unidad);
    const current = groups.get(key);

    if (current) {
      if (!current.unidadIds.includes(expensa.unidadId)) {
        current.unidadIds.push(expensa.unidadId);
      }
      if (!current.unidades.includes(unidadLabel)) {
        current.unidades.push(unidadLabel);
      }

      current.responsableIds = Array.from(
        new Set([
          ...current.responsableIds,
          ...expensa.unidad.personas.map((relacion) => relacion.persona.id).filter((value) => value > 0),
        ]),
      ).sort((a, b) => a - b);
      current.destinatarios = Array.from(new Set([...current.destinatarios, ...destinatarios.emails]));
      current.montoTotal += expensa.monto;
      current.saldoTotal += expensa.saldo;
      continue;
    }

    groups.set(key, {
      key,
      primaryUnidadId: expensa.unidadId,
      unidadIds: [expensa.unidadId],
      unidades: [unidadLabel],
      responsableIds: expensa.unidad.personas.map((relacion) => relacion.persona.id).filter((value) => value > 0),
      responsablesLabel: destinatarios.responsablesLabel,
      destinatarios: destinatarios.emails,
      montoTotal: expensa.monto,
      saldoTotal: expensa.saldo,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      primaryUnidadId: group.primaryUnidadId,
      unidadIds: group.unidadIds,
      unidadCount: group.unidades.length,
      unidadesLabel: group.unidades.join(" · "),
      responsableIds: group.responsableIds,
      responsablesLabel: group.responsablesLabel,
      destinatarios: group.destinatarios,
      montoTotal: group.montoTotal,
      saldoTotal: group.saldoTotal,
      boletaArchivo:
        params.archivos.find(
          (archivo) => archivo.tipoArchivo === "BOLETA_RESPONSABLE" && archivo.responsableGroupKey === group.key,
        ) ?? null,
    }))
    .sort((a, b) => a.responsablesLabel.localeCompare(b.responsablesLabel, "es"));
}

async function buildLiquidacionEnvioMetadata(params: {
  liquidacionId: number;
  tipoEnvio: TipoEnvioEmail;
  group: LiquidacionEmailGroup;
  boletaUrl: string | null;
  rendicionUrl: string | null;
}) {
  const previousAttempts = await prisma.envioEmail.count({
    where: {
      liquidacionId: params.liquidacionId,
      tipoEnvio: params.tipoEnvio,
      grupoEnvioKey: params.group.key,
    },
  });

  return {
    grupoEnvioKey: params.group.key,
    intento: previousAttempts + 1,
    destinatarioNombre: params.group.responsablesLabel,
    unidadIdsCsv: params.group.unidadIds.join(","),
    unidadesIncluidas: params.group.unidadesLabel,
    responsableIdsCsv: params.group.responsableIds.join(","),
    boletaUrl: params.boletaUrl,
    rendicionUrl: params.rendicionUrl,
  };
}

function parseCuentaSnapshot(snapshot: string | null | undefined): CuentaPago | null {
  if (!snapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(snapshot) as Partial<CuentaPago>;
    if (!parsed.banco || !parsed.titular || !parsed.cbu) {
      return null;
    }

    return {
      banco: parsed.banco,
      titular: parsed.titular,
      cbu: parsed.cbu,
      alias: parsed.alias ?? null,
      cuitTitular: parsed.cuitTitular ?? null,
    };
  } catch {
    return null;
  }
}

function getAbsolutePublicPath(rutaArchivo: string | null | undefined) {
  if (!rutaArchivo) {
    return null;
  }

  const relative = rutaArchivo.replace(/^\/+/, "");
  if (!relative) {
    return null;
  }

  return path.join(process.cwd(), "public", relative);
}

async function resolveAttachment(
  archivo:
    | {
        id?: number;
        nombreArchivo: string;
        rutaArchivo: string;
        mimeType: string;
      }
    | null
    | undefined,
) {
  const absolutePath = getAbsolutePublicPath(archivo?.rutaArchivo);

  if (!absolutePath || !archivo) {
    return undefined;
  }

  try {
    const content = await readFile(absolutePath);

    return [
      {
        content,
        filename: archivo.nombreArchivo,
        contentType: archivo.mimeType,
      },
    ];
  } catch {
    return undefined;
  }
}

function parseDestinatariosInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n;]+/)
        .map((item) => normalizeEmail(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
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
  const baseUrl = getPublicAppUrl();

  if (!baseUrl || !rutaArchivo) {
    return null;
  }

  return `${baseUrl}${rutaArchivo.startsWith("/") ? rutaArchivo : `/${rutaArchivo}`}`;
}

function getBrandingLogoUrl() {
  return getArchivoUrl("/branding/logo-color-v2.png");
}

function buildPaymentDetailsHtml(cuentaPago: CuentaPago | null) {
  if (!cuentaPago) {
    return "<p style=\"margin:8px 0 0;color:#475569\">Los datos de pago estaran disponibles en la boleta adjunta o en el sistema.</p>";
  }

  return `
    <ul style="margin:8px 0 0;padding-left:18px;color:#0f172a">
      <li>Banco: ${escapeHtml(cuentaPago.banco)}</li>
      <li>Titular: ${escapeHtml(cuentaPago.titular)}</li>
      <li>CBU: ${escapeHtml(cuentaPago.cbu)}</li>
      <li>Alias: ${escapeHtml(cuentaPago.alias ?? "-")}</li>
    </ul>
  `;
}

function buildMessageHtml(mensajeEditable: string) {
  return mensajeEditable
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

function buildReminderEditableContent(params: {
  unidadLabel: string;
  unidadCount: number;
  periodo: string;
}) {
  const periodoLabel = formatPeriodoLabel(params.periodo);
  const unidadPrefix = params.unidadCount === 1 ? "la unidad" : "las unidades";
  const verbo = params.unidadCount === 1 ? "registra" : "registran";

  return `Te recordamos que ${unidadPrefix} ${params.unidadLabel} ${verbo} un saldo pendiente correspondiente a la liquidación del período ${periodoLabel}.`;
}

export function renderReminderEmail(params: ReminderEmailRenderParams) {
  const periodoLabel = formatPeriodoLabel(params.periodo);
  const montoLabel = formatCurrency(params.montoPendiente);
  const logoUrl = getBrandingLogoUrl();
  const unidadTitle = params.unidadCount === 1 ? "Unidad" : "Unidades";
  const subject =
    params.subject ?? `${params.consorcioNombre} - Recordatorio de vencimiento ${params.periodo} - ${params.responsablesLabel}`;
  const text = [
    "Recordatorio de vencimiento de expensas",
    "",
    params.mensajeEditable,
    "",
    `Consorcio: ${params.consorcioNombre}`,
    `Periodo: ${params.periodo}`,
    `${unidadTitle}: ${params.unidadLabel}`,
    `Responsable: ${params.responsablesLabel}`,
    `Fecha de vencimiento: ${formatDate(params.fechaVencimiento)}`,
    `Monto pendiente: ${montoLabel}`,
    "",
    "Datos bancarios",
    `Banco: ${params.cuentaPago?.banco ?? "-"}`,
    `CBU: ${params.cuentaPago?.cbu ?? "-"}`,
    `Alias: ${params.cuentaPago?.alias ?? "-"}`,
    "",
    "Si ya registraste el pago, podes desestimar este mensaje.",
    "Este mensaje fue enviado automaticamente por AmiConsorcio.",
  ].join("\n");

  const html = `
    <div style="margin:0;padding:24px 12px;background:#e5e7eb;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dbe2ea;border-radius:16px;overflow:hidden">
        <div style="padding:22px 24px 18px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              <td style="vertical-align:middle;width:170px">
                ${logoUrl ? `<img src="${logoUrl}" alt="AmiConsorcio" width="160" style="display:block;width:160px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none" />` : `<div style="font-size:20px;font-weight:700;letter-spacing:.04em;color:#0f172a">AmiConsorcio</div>`}
              </td>
              <td style="vertical-align:middle;text-align:right">
                <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#64748b;text-transform:uppercase">Consorcio</div>
                <div style="margin-top:4px;font-size:15px;font-weight:700;color:#0f172a">${escapeHtml(params.consorcioNombre)}</div>
              </td>
            </tr>
          </table>
        </div>

        <div style="padding:28px 24px 24px">
          <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;color:#0f172a">Recordatorio de vencimiento de expensas</h1>
          <div style="margin:0 0 20px">
            ${buildMessageHtml(params.mensajeEditable)}
          </div>

          <div style="margin:0 0 18px;padding:18px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc">
            <div style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#64748b;text-transform:uppercase">Datos importantes</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td style="padding:0 12px 10px 0;font-size:13px;color:#64748b;width:42%">Consorcio</td>
                <td style="padding:0 0 10px;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(params.consorcioNombre)}</td>
              </tr>
              <tr>
                <td style="padding:0 12px 10px 0;font-size:13px;color:#64748b">Periodo</td>
                <td style="padding:0 0 10px;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(params.periodo)} (${escapeHtml(periodoLabel)})</td>
              </tr>
              <tr>
                <td style="padding:0 12px 10px 0;font-size:13px;color:#64748b">${escapeHtml(unidadTitle)}</td>
                <td style="padding:0 0 10px;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(params.unidadLabel)}</td>
              </tr>
              <tr>
                <td style="padding:0 12px 10px 0;font-size:13px;color:#64748b">Responsable</td>
                <td style="padding:0 0 10px;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(params.responsablesLabel)}</td>
              </tr>
              <tr>
                <td style="padding:0 12px 10px 0;font-size:13px;color:#64748b">Fecha de vencimiento</td>
                <td style="padding:0 0 10px;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(formatDate(params.fechaVencimiento))}</td>
              </tr>
              <tr>
                <td style="padding:0 12px 0 0;font-size:13px;color:#64748b">Monto pendiente</td>
                <td style="padding:0;font-size:18px;font-weight:700;color:#0f172a">${escapeHtml(montoLabel)}</td>
              </tr>
            </table>
          </div>

          <div style="margin:0 0 18px;padding:18px;border:1px solid #dbeafe;border-radius:14px;background:#eff6ff">
            <div style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#1d4ed8;text-transform:uppercase">Datos bancarios</div>
            ${
              params.cuentaPago
                ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                    <tr>
                      <td style="padding:0 12px 10px 0;font-size:13px;color:#64748b;width:30%">Banco</td>
                      <td style="padding:0 0 10px;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(params.cuentaPago.banco)}</td>
                    </tr>
                    <tr>
                      <td style="padding:0 12px 10px 0;font-size:13px;color:#64748b">CBU</td>
                      <td style="padding:0 0 10px;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(params.cuentaPago.cbu)}</td>
                    </tr>
                    <tr>
                      <td style="padding:0 12px 0 0;font-size:13px;color:#64748b">Alias</td>
                      <td style="padding:0;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(params.cuentaPago.alias ?? "-")}</td>
                    </tr>
                  </table>
                `
                : `<p style="margin:0;font-size:14px;line-height:1.6;color:#334155">Los datos bancarios se encuentran disponibles en la boleta adjunta o en el sistema.</p>`
            }
          </div>

          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569">Si ya registraste el pago, podés desestimar este mensaje.</p>
        </div>

        <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b">Este mensaje fue enviado automáticamente por AmiConsorcio.</p>
        </div>
      </div>
    </div>
  `;

  return {
    subject,
    html,
    text,
  };
}

function buildTemplate(params: {
  tipoEnvio: TipoEnvioEmail;
  consorcioNombre: string;
  periodo: string;
  unidadLabel: string;
  unidadCount: number;
  responsablesLabel: string;
  fechaVencimiento: Date | null;
  monto: number;
  mensajeEditable?: string;
  boletaUrl: string | null;
  rendicionUrl: string | null;
  cuentaPago: CuentaPago | null;
}) {
  const periodoLabel = formatPeriodoLabel(params.periodo);
  const montoLabel = formatCurrency(params.monto);
  const unidadTitle = params.unidadCount === 1 ? "Unidad" : "Unidades";
  const subjectScope = params.responsablesLabel !== "Sin responsable" ? params.responsablesLabel : params.unidadLabel;
  const subject =
    params.tipoEnvio === EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE
      ? `${params.consorcioNombre} - Liquidacion ${params.periodo} - ${subjectScope}`
      : `${params.consorcioNombre} - Recordatorio de vencimiento ${params.periodo} - ${subjectScope}`;

  const introBase =
    params.tipoEnvio === EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE
      ? `La liquidación del período ${periodoLabel} ya fue cerrada y la boleta correspondiente se encuentra disponible.`
      : `Te recordamos que ${params.unidadCount === 1 ? "la unidad" : "las unidades"} ${params.unidadLabel} ${params.unidadCount === 1 ? "mantiene" : "mantienen"} un saldo pendiente para la liquidación del período ${periodoLabel}.`;
  const intro = params.mensajeEditable?.trim() || introBase;

  const amountLine =
    params.tipoEnvio === EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE
      ? `Importe liquidado: ${montoLabel}`
      : `Monto pendiente al dia de hoy: ${montoLabel}`;

  const links = [params.boletaUrl ? `<li><a href="${params.boletaUrl}" style="color:#2563eb">Ver boleta</a></li>` : null, params.rendicionUrl ? `<li><a href="${params.rendicionUrl}" style="color:#2563eb">Ver rendicion</a></li>` : null]
    .filter((value): value is string => Boolean(value))
    .join("");

  const bodyLines = [
    intro,
    "",
    `Consorcio: ${params.consorcioNombre}`,
    `Periodo: ${params.periodo}`,
    `${unidadTitle}: ${params.unidadLabel}`,
    `Responsable: ${params.responsablesLabel}`,
    `Vencimiento: ${formatDate(params.fechaVencimiento)}`,
    amountLine,
    "",
    params.cuentaPago
      ? `Pago por transferencia: ${params.cuentaPago.banco} | CBU ${params.cuentaPago.cbu} | Alias ${params.cuentaPago.alias ?? "-"}`
      : "Los datos de pago estan disponibles en la boleta o en el sistema.",
    params.boletaUrl ? `Boleta: ${params.boletaUrl}` : null,
    params.rendicionUrl ? `Rendicion: ${params.rendicionUrl}` : null,
    "",
    "Si ya registraste el pago, podes ignorar este mensaje.",
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#64748b">AMICONSORCIO</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">${escapeHtml(subject)}</h1>
        <p style="margin:0 0 16px;color:#334155">${escapeHtml(intro)}</p>

        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;background:#f8fafc">
          <p style="margin:0 0 8px"><strong>Consorcio:</strong> ${escapeHtml(params.consorcioNombre)}</p>
          <p style="margin:0 0 8px"><strong>Periodo:</strong> ${escapeHtml(params.periodo)}</p>
          <p style="margin:0 0 8px"><strong>${escapeHtml(unidadTitle)}:</strong> ${escapeHtml(params.unidadLabel)}</p>
          <p style="margin:0 0 8px"><strong>Responsable:</strong> ${escapeHtml(params.responsablesLabel)}</p>
          <p style="margin:0 0 8px"><strong>Vencimiento:</strong> ${escapeHtml(formatDate(params.fechaVencimiento))}</p>
          <p style="margin:0"><strong>${escapeHtml(amountLine)}</strong></p>
        </div>

        <div style="margin-top:20px">
          <p style="margin:0;font-weight:700">Datos de pago</p>
          ${buildPaymentDetailsHtml(params.cuentaPago)}
        </div>

        ${links ? `<div style="margin-top:20px"><p style="margin:0 0 8px;font-weight:700">Documentos</p><ul style="margin:0;padding-left:18px">${links}</ul></div>` : ""}

        <p style="margin:20px 0 0;color:#475569">Si ya registraste el pago, podes ignorar este mensaje.</p>
      </div>
    </div>
  `;

  return {
    subject,
    body: bodyLines,
    html,
    text: `${subject}\n\n${bodyLines}`,
  };
}

async function getLiquidacionEmailContext(liquidacionId: number, onlyPendientes: boolean) {
  return prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    select: {
      id: true,
      consorcioId: true,
      periodo: true,
      fechaVencimiento: true,
      boletaCuentaSnapshot: true,
      consorcio: {
        select: {
          nombre: true,
          cuentasBancarias: {
            where: { activa: true },
            orderBy: [{ esCuentaExpensas: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
            select: {
              banco: true,
              titular: true,
              cbu: true,
              alias: true,
              cuitTitular: true,
              esCuentaExpensas: true,
            },
          },
        },
      },
      archivos: {
        where: { activo: true },
        select: {
          id: true,
          tipoArchivo: true,
          nombreArchivo: true,
          rutaArchivo: true,
          mimeType: true,
          responsableGroupKey: true,
        },
      },
      expensas: {
        where: onlyPendientes ? { saldo: { gt: 0 } } : undefined,
        orderBy: [{ unidad: { identificador: "asc" } }, { unidadId: "asc" }],
        select: {
          id: true,
          monto: true,
          saldo: true,
          unidadId: true,
          unidad: {
            select: {
              identificador: true,
              tipo: true,
                personas: {
                  orderBy: [{ desde: "desc" }, { persona: { apellido: "asc" } }, { persona: { nombre: "asc" } }],
                  select: {
                    desde: true,
                    hasta: true,
                    tipoRelacion: true,
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
          },
        },
      },
    },
  });
}

async function procesarEnviosLiquidacion(params: {
  liquidacionId: number;
  tipoEnvio: TipoEnvioEmail;
  onlyPendientes: boolean;
  onProgress?: (progress: LiquidacionEmailProgress) => void | Promise<void>;
}) {
  const liquidacion = await getLiquidacionEmailContext(params.liquidacionId, params.onlyPendientes);

  if (!liquidacion) {
    throw new Error("liquidacion_inexistente");
  }

  const cuentaPago =
    parseCuentaSnapshot(liquidacion.boletaCuentaSnapshot) ??
    liquidacion.consorcio.cuentasBancarias.find((cuenta) => cuenta.esCuentaExpensas) ??
    liquidacion.consorcio.cuentasBancarias[0] ??
    null;

  const rendicionArchivo = liquidacion.archivos.find((archivo) => archivo.tipoArchivo === "RENDICION") ?? null;
  const rendicionUrl = getArchivoUrl(rendicionArchivo?.rutaArchivo);
  const groups = buildLiquidacionEmailGroups({
    expensas: liquidacion.expensas,
    archivos: liquidacion.archivos,
    tipoEnvio: params.tipoEnvio,
  });

  const results: Array<{ estado: string }> = [];
  const details: LiquidacionEmailTraceItem[] = [];
  const notifyProgress = async (ultimoError: string | null = null) => {
    if (!params.onProgress) {
      return;
    }

    const summary = buildEmailSummary(results);
    await params.onProgress({
      total: groups.length,
      processed: results.length,
      enviados: summary.enviados,
      fallidos: summary.fallidos,
      sinDestinatario: summary.sinDestinatario,
      ultimoError,
    });
  };

  await notifyProgress();

  for (const group of groups) {
    const monto = params.tipoEnvio === EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO ? group.saldoTotal : group.montoTotal;
    const boletaUrl = getArchivoUrl(group.boletaArchivo?.rutaArchivo);
    const template = buildTemplate({
      tipoEnvio: params.tipoEnvio,
      consorcioNombre: liquidacion.consorcio.nombre,
      periodo: liquidacion.periodo,
      unidadLabel: group.unidadesLabel,
      unidadCount: group.unidadCount,
      responsablesLabel: group.responsablesLabel,
      fechaVencimiento: liquidacion.fechaVencimiento,
      monto,
      boletaUrl,
      rendicionUrl,
      cuentaPago,
    });
    const envioMetadata = await buildLiquidacionEnvioMetadata({
      liquidacionId: liquidacion.id,
      tipoEnvio: params.tipoEnvio,
      group,
      boletaUrl,
      rendicionUrl,
    });

    if (group.destinatarios.length === 0) {
      const replyKey = createEmailReplyKey();

      await prisma.envioEmail.create({
        data: {
          consorcioId: liquidacion.consorcioId,
          tipoEnvio: params.tipoEnvio,
          liquidacionId: liquidacion.id,
          unidadId: group.primaryUnidadId,
          ...envioMetadata,
          destinatario: null,
          asunto: template.subject,
          cuerpo: template.body,
          estado: EMAIL_ESTADO.SIN_DESTINATARIO,
          errorMensaje: "No se encontro un email valido para el grupo responsable de la boleta.",
          replyKey,
        },
      });
      results.push({ estado: EMAIL_ESTADO.SIN_DESTINATARIO });
      details.push({
        estado: EMAIL_ESTADO.SIN_DESTINATARIO,
        destinatario: null,
        destinatarioNombre: group.responsablesLabel,
        unidadesIncluidas: group.unidadesLabel,
        asunto: template.subject,
        errorMensaje: "No se encontro un email valido para el grupo responsable de la boleta.",
      });
      await notifyProgress("No se encontro un email valido para el grupo responsable de la boleta.");
      continue;
    }

    const replyKey = createEmailReplyKey();
    const envio = await prisma.envioEmail.create({
      data: {
        consorcioId: liquidacion.consorcioId,
        tipoEnvio: params.tipoEnvio,
        liquidacionId: liquidacion.id,
        unidadId: group.primaryUnidadId,
        ...envioMetadata,
        destinatario: group.destinatarios.join(", "),
        asunto: template.subject,
        cuerpo: template.body,
        estado: EMAIL_ESTADO.PENDIENTE,
        replyKey,
      },
      select: { id: true, replyKey: true },
    });

    try {
      const response = await sendEmail({
        to: group.destinatarios,
        subject: template.subject,
        html: template.html,
        text: template.text,
        replyTo: buildReplyToAddress(envio.replyKey) ?? undefined,
        attachments: await resolveAttachment(group.boletaArchivo),
      });

      await prisma.envioEmail.update({
        where: { id: envio.id },
        data: {
          estado: EMAIL_ESTADO.ENVIADO,
          providerMessageId: response?.id ?? null,
          enviadoAt: new Date(),
          errorMensaje: null,
        },
      });

      results.push({ estado: EMAIL_ESTADO.ENVIADO });
      details.push({
        estado: EMAIL_ESTADO.ENVIADO,
        destinatario: group.destinatarios.join(", "),
        destinatarioNombre: group.responsablesLabel,
        unidadesIncluidas: group.unidadesLabel,
        asunto: template.subject,
        errorMensaje: null,
      });
      await notifyProgress();
    } catch (error) {
      const errorMessage = extractEmailErrorMessage(error);

      await prisma.envioEmail.update({
        where: { id: envio.id },
        data: {
          estado: EMAIL_ESTADO.ERROR,
          errorMensaje: errorMessage,
        },
      });

      results.push({ estado: EMAIL_ESTADO.ERROR });
      details.push({
        estado: EMAIL_ESTADO.ERROR,
        destinatario: group.destinatarios.join(", "),
        destinatarioNombre: group.responsablesLabel,
        unidadesIncluidas: group.unidadesLabel,
        asunto: template.subject,
        errorMensaje: errorMessage,
      });
      await notifyProgress(errorMessage);
    }
  }

  return {
    ...buildEmailSummary(results),
    detalles: details,
  };
}

export async function buildReminderDrafts(liquidacionId: number): Promise<ReminderDraft[]> {
  const liquidacion = await getLiquidacionEmailContext(liquidacionId, true);

  if (!liquidacion) {
    throw new Error("liquidacion_inexistente");
  }

  const cuentaPago =
    parseCuentaSnapshot(liquidacion.boletaCuentaSnapshot) ??
    liquidacion.consorcio.cuentasBancarias.find((cuenta) => cuenta.esCuentaExpensas) ??
    liquidacion.consorcio.cuentasBancarias[0] ??
    null;
  const groups = buildLiquidacionEmailGroups({
    expensas: liquidacion.expensas,
    archivos: liquidacion.archivos,
    tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
  });

  return groups.map((group) => {
    const reminderEmail = renderReminderEmail({
      consorcioNombre: liquidacion.consorcio.nombre,
      periodo: liquidacion.periodo,
      unidadLabel: group.unidadesLabel,
      unidadCount: group.unidadCount,
      responsablesLabel: group.responsablesLabel,
      fechaVencimiento: liquidacion.fechaVencimiento,
      montoPendiente: group.saldoTotal,
      mensajeEditable: buildReminderEditableContent({
        unidadLabel: group.unidadesLabel,
        unidadCount: group.unidadCount,
        periodo: liquidacion.periodo,
      }),
      cuentaPago,
    });

    return {
      unidadId: group.primaryUnidadId,
      unidadIdsCsv: group.unidadIds.join(","),
      unidadLabel: group.unidadesLabel,
      unidadCount: group.unidadCount,
      responsablesLabel: group.responsablesLabel,
      responsableIdsCsv: group.responsableIds.join(","),
      destinatario: group.destinatarios.join(", "),
      asunto: reminderEmail.subject,
      cuerpo: buildReminderEditableContent({
        unidadLabel: group.unidadesLabel,
        unidadCount: group.unidadCount,
        periodo: liquidacion.periodo,
      }),
      saldoPendiente: group.saldoTotal,
      boletaArchivoId: group.boletaArchivo?.id ?? null,
      boletaNombre: group.boletaArchivo?.nombreArchivo ?? null,
      tieneBoletaAdjunta: Boolean(group.boletaArchivo),
    };
  });
}

export async function sendReminderDrafts(params: {
  liquidacionId: number;
  drafts: ReminderDraftInput[];
}): Promise<EmailSummary> {
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: params.liquidacionId },
    select: {
      id: true,
      consorcioId: true,
      periodo: true,
      fechaVencimiento: true,
      boletaCuentaSnapshot: true,
      consorcio: {
        select: {
          nombre: true,
          cuentasBancarias: {
            where: { activa: true },
            orderBy: [{ esCuentaExpensas: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
            select: {
              banco: true,
              titular: true,
              cbu: true,
              alias: true,
              cuitTitular: true,
              esCuentaExpensas: true,
            },
          },
        },
      },
      archivos: {
        where: { activo: true },
        select: {
          id: true,
          nombreArchivo: true,
          rutaArchivo: true,
          mimeType: true,
        },
      },
    },
  });

  if (!liquidacion) {
    throw new Error("liquidacion_inexistente");
  }

  const cuentaPago =
    parseCuentaSnapshot(liquidacion.boletaCuentaSnapshot) ??
    liquidacion.consorcio.cuentasBancarias.find((cuenta) => cuenta.esCuentaExpensas) ??
    liquidacion.consorcio.cuentasBancarias[0] ??
    null;
  const results: Array<{ estado: string }> = [];

  for (const draft of params.drafts) {
    const destinatarios = parseDestinatariosInput(draft.destinatario);
    const boletaArchivo =
      draft.boletaArchivoId !== null
        ? liquidacion.archivos.find((archivo) => archivo.id === draft.boletaArchivoId) ?? null
        : null;
    const boletaUrl = getArchivoUrl(boletaArchivo?.rutaArchivo);
    const grupoEnvioKey = `${draft.unidadId}:${draft.unidadLabel}`;
    const envioMetadata = {
      grupoEnvioKey,
      intento:
        (await prisma.envioEmail.count({
          where: {
            liquidacionId: liquidacion.id,
            tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
            grupoEnvioKey,
          },
        })) + 1,
      destinatarioNombre: draft.responsablesLabel,
      unidadIdsCsv: draft.unidadIdsCsv,
      unidadesIncluidas: draft.unidadLabel,
      responsableIdsCsv: draft.responsableIdsCsv || null,
      boletaUrl,
      rendicionUrl: null,
    };

    if (destinatarios.length === 0) {
      const replyKey = createEmailReplyKey();

      await prisma.envioEmail.create({
        data: {
          consorcioId: liquidacion.consorcioId,
          tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
          liquidacionId: liquidacion.id,
          unidadId: draft.unidadId,
          ...envioMetadata,
          destinatario: null,
          asunto: draft.asunto,
          cuerpo: draft.cuerpo,
          estado: EMAIL_ESTADO.SIN_DESTINATARIO,
          errorMensaje: "No se encontro un email valido para el borrador seleccionado.",
          replyKey,
        },
      });
      results.push({ estado: EMAIL_ESTADO.SIN_DESTINATARIO });
      continue;
    }

    const rendered = renderReminderEmail({
      subject: draft.asunto,
      consorcioNombre: liquidacion.consorcio.nombre,
      periodo: liquidacion.periodo,
      unidadLabel: draft.unidadLabel,
      unidadCount: draft.unidadCount,
      responsablesLabel: draft.responsablesLabel,
      fechaVencimiento: liquidacion.fechaVencimiento,
      montoPendiente: draft.saldoPendiente,
      mensajeEditable: draft.cuerpo,
      cuentaPago,
    });

    const replyKey = createEmailReplyKey();
    const envio = await prisma.envioEmail.create({
      data: {
        consorcioId: liquidacion.consorcioId,
        tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
        liquidacionId: liquidacion.id,
        unidadId: draft.unidadId,
        ...envioMetadata,
        destinatario: destinatarios.join(", "),
        asunto: draft.asunto,
        cuerpo: draft.cuerpo,
        estado: EMAIL_ESTADO.PENDIENTE,
        replyKey,
      },
      select: { id: true, replyKey: true },
    });

    try {
      const response = await sendEmail({
        to: destinatarios,
        subject: draft.asunto,
        html: rendered.html,
        text: rendered.text,
        replyTo: buildReplyToAddress(envio.replyKey) ?? undefined,
        attachments: await resolveAttachment(boletaArchivo),
      });

      await prisma.envioEmail.update({
        where: { id: envio.id },
        data: {
          estado: EMAIL_ESTADO.ENVIADO,
          providerMessageId: response?.id ?? null,
          enviadoAt: new Date(),
          errorMensaje: null,
        },
      });

      results.push({ estado: EMAIL_ESTADO.ENVIADO });
    } catch (error) {
      const errorMessage = extractEmailErrorMessage(error);

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

  return buildEmailSummary(results);
}

export async function buildLiquidacionClosureDrafts(liquidacionId: number): Promise<LiquidacionClosureDraft[]> {
  const liquidacion = await getLiquidacionEmailContext(liquidacionId, false);

  if (!liquidacion) {
    throw new Error("liquidacion_inexistente");
  }

  const rendicionArchivo = liquidacion.archivos.find((archivo) => archivo.tipoArchivo === "RENDICION") ?? null;
  const rendicionUrl = getArchivoUrl(rendicionArchivo?.rutaArchivo);
  const groups = buildLiquidacionEmailGroups({
    expensas: liquidacion.expensas,
    archivos: liquidacion.archivos,
    tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
  });

  const latestByGroup = new Map(
    (
      await prisma.envioEmail.findMany({
        where: {
          liquidacionId,
          tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
          grupoEnvioKey: { not: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      })
    ).map((envio) => [envio.grupoEnvioKey ?? "", envio]),
  );

  return groups.map((group) => {
    const template = buildTemplate({
      tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
      consorcioNombre: liquidacion.consorcio.nombre,
      periodo: liquidacion.periodo,
      unidadLabel: group.unidadesLabel,
      unidadCount: group.unidadCount,
      responsablesLabel: group.responsablesLabel,
      fechaVencimiento: liquidacion.fechaVencimiento,
      monto: group.montoTotal,
      boletaUrl: getArchivoUrl(group.boletaArchivo?.rutaArchivo),
      rendicionUrl,
      cuentaPago:
        parseCuentaSnapshot(liquidacion.boletaCuentaSnapshot) ??
        liquidacion.consorcio.cuentasBancarias.find((cuenta) => cuenta.esCuentaExpensas) ??
        liquidacion.consorcio.cuentasBancarias[0] ??
        null,
    });
    const latest = latestByGroup.get(group.key) ?? null;

    return {
      unidadId: group.primaryUnidadId,
      unidadIdsCsv: group.unidadIds.join(","),
      unidadLabel: group.unidadesLabel,
      unidadCount: group.unidadCount,
      responsablesLabel: group.responsablesLabel,
      responsableIdsCsv: group.responsableIds.join(","),
      destinatario: group.destinatarios.join(", "),
      asunto: template.subject,
      cuerpo: template.body,
      importeLiquidado: group.montoTotal,
      boletaArchivoId: group.boletaArchivo?.id ?? null,
      boletaNombre: group.boletaArchivo?.nombreArchivo ?? null,
      tieneBoletaAdjunta: Boolean(group.boletaArchivo),
      rendicionUrl,
      ultimoEstado:
        latest?.estado === EMAIL_ESTADO.ENVIADO || latest?.estado === EMAIL_ESTADO.ERROR || latest?.estado === EMAIL_ESTADO.SIN_DESTINATARIO
          ? (latest.estado as "ENVIADO" | "ERROR" | "SIN_DESTINATARIO")
          : "SIN_ENVIO",
      ultimoError: latest?.errorMensaje ?? null,
    };
  });
}

export async function sendLiquidacionClosureDrafts(params: {
  liquidacionId: number;
  drafts: LiquidacionClosureDraftInput[];
}) {
  const liquidacion = await getLiquidacionEmailContext(params.liquidacionId, false);

  if (!liquidacion) {
    throw new Error("liquidacion_inexistente");
  }

  const cuentaPago =
    parseCuentaSnapshot(liquidacion.boletaCuentaSnapshot) ??
    liquidacion.consorcio.cuentasBancarias.find((cuenta) => cuenta.esCuentaExpensas) ??
    liquidacion.consorcio.cuentasBancarias[0] ??
    null;
  const rendicionArchivo = liquidacion.archivos.find((archivo) => archivo.tipoArchivo === "RENDICION") ?? null;
  const rendicionUrl = getArchivoUrl(rendicionArchivo?.rutaArchivo);
  const results: Array<{ estado: string }> = [];

  for (const draft of params.drafts) {
    const destinatarios = parseDestinatariosInput(draft.destinatario);
    const boletaArchivo =
      draft.boletaArchivoId !== null
        ? liquidacion.archivos.find((archivo) => archivo.id === draft.boletaArchivoId) ?? null
        : null;
    const boletaUrl = getArchivoUrl(boletaArchivo?.rutaArchivo);
    const grupoEnvioKey = `${draft.unidadIdsCsv}:${draft.responsableIdsCsv || draft.responsablesLabel}`;
    const envioMetadata = {
      grupoEnvioKey,
      intento:
        (await prisma.envioEmail.count({
          where: {
            liquidacionId: liquidacion.id,
            tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
            grupoEnvioKey,
          },
        })) + 1,
      destinatarioNombre: draft.responsablesLabel,
      unidadIdsCsv: draft.unidadIdsCsv,
      unidadesIncluidas: draft.unidadLabel,
      responsableIdsCsv: draft.responsableIdsCsv || null,
      boletaUrl,
      rendicionUrl,
    };
    const rendered = buildTemplate({
      tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
      consorcioNombre: liquidacion.consorcio.nombre,
      periodo: liquidacion.periodo,
      unidadLabel: draft.unidadLabel,
      unidadCount: draft.unidadCount,
      responsablesLabel: draft.responsablesLabel,
      fechaVencimiento: liquidacion.fechaVencimiento,
      monto: draft.importeLiquidado,
      mensajeEditable: draft.cuerpo,
      boletaUrl,
      rendicionUrl,
      cuentaPago,
    });

    if (destinatarios.length === 0) {
      const replyKey = createEmailReplyKey();

      await prisma.envioEmail.create({
        data: {
          consorcioId: liquidacion.consorcioId,
          tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
          liquidacionId: liquidacion.id,
          unidadId: draft.unidadId,
          ...envioMetadata,
          destinatario: null,
          asunto: draft.asunto,
          cuerpo: draft.cuerpo,
          estado: EMAIL_ESTADO.SIN_DESTINATARIO,
          errorMensaje: "No se encontro un email valido para el destinatario seleccionado.",
          replyKey,
        },
      });
      results.push({ estado: EMAIL_ESTADO.SIN_DESTINATARIO });
      continue;
    }

    const replyKey = createEmailReplyKey();
    const envio = await prisma.envioEmail.create({
      data: {
        consorcioId: liquidacion.consorcioId,
        tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
        liquidacionId: liquidacion.id,
        unidadId: draft.unidadId,
        ...envioMetadata,
        destinatario: destinatarios.join(", "),
        asunto: draft.asunto,
        cuerpo: draft.cuerpo,
        estado: EMAIL_ESTADO.PENDIENTE,
        replyKey,
      },
      select: { id: true, replyKey: true },
    });

    try {
      const response = await sendEmail({
        to: destinatarios,
        subject: draft.asunto,
        html: rendered.html,
        text: rendered.text,
        replyTo: buildReplyToAddress(envio.replyKey) ?? undefined,
        attachments: await resolveAttachment(boletaArchivo),
      });

      await prisma.envioEmail.update({
        where: { id: envio.id },
        data: {
          estado: EMAIL_ESTADO.ENVIADO,
          providerMessageId: response?.id ?? null,
          enviadoAt: new Date(),
          errorMensaje: null,
        },
      });

      results.push({ estado: EMAIL_ESTADO.ENVIADO });
    } catch (error) {
      const errorMessage = extractEmailErrorMessage(error);

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

  return buildEmailSummary(results);
}

export async function enviarLiquidacionCerradaEmails(
  liquidacionId: number,
  options?: { onProgress?: (progress: LiquidacionEmailProgress) => void | Promise<void> },
) {
  return procesarEnviosLiquidacion({
    liquidacionId,
    tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
    onlyPendientes: false,
    onProgress: options?.onProgress,
  });
}

export async function enviarRecordatoriosPendientes(liquidacionId: number) {
  return procesarEnviosLiquidacion({
    liquidacionId,
    tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
    onlyPendientes: true,
  });
}
