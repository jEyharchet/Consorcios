import path from "path";
import { readFile } from "fs/promises";

import { sendEmail } from "./email";
import { buildEmailSummary, EMAIL_ESTADO, formatEmailSummary, type EmailSummary } from "./email-tracking";
import { prisma } from "./prisma";

export { formatEmailSummary } from "./email-tracking";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const EMAIL_TIPO_ENVIO = {
  LIQUIDACION_CIERRE: "LIQUIDACION_CIERRE",
  RECORDATORIO_VENCIMIENTO: "RECORDATORIO_VENCIMIENTO",
} as const;

type TipoEnvioEmail = (typeof EMAIL_TIPO_ENVIO)[keyof typeof EMAIL_TIPO_ENVIO];

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

type CuentaPago = {
  banco: string;
  titular: string;
  cbu: string;
  alias: string | null;
  cuitTitular: string | null;
};

export type ReminderDraft = {
  unidadId: number;
  unidadLabel: string;
  responsablesLabel: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  saldoPendiente: number;
  boletaArchivoId: number | null;
  boletaNombre: string | null;
  tieneBoletaAdjunta: boolean;
};

type ReminderDraftInput = {
  unidadId: number;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  boletaArchivoId: number | null;
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

function resolveBaseResponsables(relaciones: ResponsableRelacion[]) {
  if (relaciones.length === 0) {
    return [] as ResponsableRelacion[];
  }

  const now = new Date();
  const vigentes = relaciones.filter((rel) => rel.desde <= now && (!rel.hasta || rel.hasta >= now));
  return vigentes.length > 0 ? vigentes : [relaciones[0]];
}

function buildResponsableGroupKey(relaciones: ResponsableRelacion[]) {
  const base = resolveBaseResponsables(relaciones);

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

function resolveDestinatarios(relaciones: ResponsableRelacion[]) {
  const base = resolveBaseResponsables(relaciones);
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

function buildEditableEmailHtml(subject: string, body: string) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#64748b">AMICONSORCIO</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">${escapeHtml(subject)}</h1>
        <div style="color:#334155;line-height:1.6">${escapeHtml(body).replace(/\n/g, "<br />")}</div>
      </div>
    </div>
  `;
}

function getPublicAppUrl() {
  const baseUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "";

  return baseUrl.replace(/\/+$/, "");
}

function getArchivoUrl(rutaArchivo: string | null | undefined) {
  const baseUrl = getPublicAppUrl();

  if (!baseUrl || !rutaArchivo) {
    return null;
  }

  return `${baseUrl}${rutaArchivo.startsWith("/") ? rutaArchivo : `/${rutaArchivo}`}`;
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

function buildTemplate(params: {
  tipoEnvio: TipoEnvioEmail;
  consorcioNombre: string;
  periodo: string;
  unidadLabel: string;
  responsablesLabel: string;
  fechaVencimiento: Date | null;
  monto: number;
  boletaUrl: string | null;
  rendicionUrl: string | null;
  cuentaPago: CuentaPago | null;
}) {
  const periodoLabel = formatPeriodoLabel(params.periodo);
  const montoLabel = formatCurrency(params.monto);
  const subject =
    params.tipoEnvio === EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE
      ? `${params.consorcioNombre} - Liquidacion ${params.periodo} - ${params.unidadLabel}`
      : `${params.consorcioNombre} - Recordatorio de vencimiento ${params.periodo} - ${params.unidadLabel}`;

  const intro =
    params.tipoEnvio === EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE
      ? `La liquidacion del periodo ${periodoLabel} ya fue cerrada y la boleta correspondiente se encuentra disponible.`
      : `Te recordamos que la unidad ${params.unidadLabel} mantiene un saldo pendiente para la liquidacion del periodo ${periodoLabel}.`;

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
    `Unidad: ${params.unidadLabel}`,
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
          <p style="margin:0 0 8px"><strong>Unidad:</strong> ${escapeHtml(params.unidadLabel)}</p>
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

  const results: Array<{ estado: string }> = [];

  for (const expensa of liquidacion.expensas) {
    const destinatarios = resolveDestinatarios(expensa.unidad.personas);
    const boletaArchivo =
      liquidacion.archivos.find(
        (archivo) =>
          archivo.tipoArchivo === "BOLETA_RESPONSABLE" &&
          archivo.responsableGroupKey === buildResponsableGroupKey(expensa.unidad.personas),
      ) ?? null;

    const monto = params.tipoEnvio === EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO ? expensa.saldo : expensa.monto;
    const template = buildTemplate({
      tipoEnvio: params.tipoEnvio,
      consorcioNombre: liquidacion.consorcio.nombre,
      periodo: liquidacion.periodo,
      unidadLabel: `${expensa.unidad.identificador} (${expensa.unidad.tipo})`,
      responsablesLabel: destinatarios.responsablesLabel,
      fechaVencimiento: liquidacion.fechaVencimiento,
      monto,
      boletaUrl: getArchivoUrl(boletaArchivo?.rutaArchivo),
      rendicionUrl,
      cuentaPago,
    });

    if (destinatarios.emails.length === 0) {
      await prisma.envioEmail.create({
        data: {
          consorcioId: liquidacion.consorcioId,
          tipoEnvio: params.tipoEnvio,
          liquidacionId: liquidacion.id,
          unidadId: expensa.unidadId,
          destinatario: null,
          asunto: template.subject,
          cuerpo: template.body,
          estado: EMAIL_ESTADO.SIN_DESTINATARIO,
          errorMensaje: "No se encontro un email valido para el responsable vigente de la unidad.",
        },
      });
      results.push({ estado: EMAIL_ESTADO.SIN_DESTINATARIO });
      continue;
    }

    const envio = await prisma.envioEmail.create({
      data: {
        consorcioId: liquidacion.consorcioId,
        tipoEnvio: params.tipoEnvio,
        liquidacionId: liquidacion.id,
        unidadId: expensa.unidadId,
        destinatario: destinatarios.emails.join(", "),
        asunto: template.subject,
        cuerpo: template.body,
        estado: EMAIL_ESTADO.PENDIENTE,
      },
      select: { id: true },
    });

    try {
      const response = await sendEmail({
        to: destinatarios.emails,
        subject: template.subject,
        html: template.html,
        text: template.text,
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

  return buildEmailSummary(results);
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

  const rendicionArchivo = liquidacion.archivos.find((archivo) => archivo.tipoArchivo === "RENDICION") ?? null;
  const rendicionUrl = getArchivoUrl(rendicionArchivo?.rutaArchivo);

  return liquidacion.expensas.map((expensa) => {
    const destinatarios = resolveDestinatarios(expensa.unidad.personas);
    const boletaArchivo =
      liquidacion.archivos.find(
        (archivo) =>
          archivo.tipoArchivo === "BOLETA_RESPONSABLE" &&
          archivo.responsableGroupKey === buildResponsableGroupKey(expensa.unidad.personas),
      ) ?? null;

    const template = buildTemplate({
      tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
      consorcioNombre: liquidacion.consorcio.nombre,
      periodo: liquidacion.periodo,
      unidadLabel: `${expensa.unidad.identificador} (${expensa.unidad.tipo})`,
      responsablesLabel: destinatarios.responsablesLabel,
      fechaVencimiento: liquidacion.fechaVencimiento,
      monto: expensa.saldo,
      boletaUrl: getArchivoUrl(boletaArchivo?.rutaArchivo),
      rendicionUrl,
      cuentaPago,
    });

    return {
      unidadId: expensa.unidadId,
      unidadLabel: `${expensa.unidad.identificador} (${expensa.unidad.tipo})`,
      responsablesLabel: destinatarios.responsablesLabel,
      destinatario: destinatarios.emails.join(", "),
      asunto: template.subject,
      cuerpo: template.body,
      saldoPendiente: expensa.saldo,
      boletaArchivoId: boletaArchivo?.id ?? null,
      boletaNombre: boletaArchivo?.nombreArchivo ?? null,
      tieneBoletaAdjunta: Boolean(boletaArchivo),
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

  const results: Array<{ estado: string }> = [];

  for (const draft of params.drafts) {
    const destinatarios = parseDestinatariosInput(draft.destinatario);

    if (destinatarios.length === 0) {
      await prisma.envioEmail.create({
        data: {
          consorcioId: liquidacion.consorcioId,
          tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
          liquidacionId: liquidacion.id,
          unidadId: draft.unidadId,
          destinatario: null,
          asunto: draft.asunto,
          cuerpo: draft.cuerpo,
          estado: EMAIL_ESTADO.SIN_DESTINATARIO,
          errorMensaje: "No se encontro un email valido para el borrador seleccionado.",
        },
      });
      results.push({ estado: EMAIL_ESTADO.SIN_DESTINATARIO });
      continue;
    }

    const boletaArchivo =
      draft.boletaArchivoId !== null
        ? liquidacion.archivos.find((archivo) => archivo.id === draft.boletaArchivoId) ?? null
        : null;

    const envio = await prisma.envioEmail.create({
      data: {
        consorcioId: liquidacion.consorcioId,
        tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
        liquidacionId: liquidacion.id,
        unidadId: draft.unidadId,
        destinatario: destinatarios.join(", "),
        asunto: draft.asunto,
        cuerpo: draft.cuerpo,
        estado: EMAIL_ESTADO.PENDIENTE,
      },
      select: { id: true },
    });

    try {
      const response = await sendEmail({
        to: destinatarios,
        subject: draft.asunto,
        html: buildEditableEmailHtml(draft.asunto, draft.cuerpo),
        text: draft.cuerpo,
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

  return buildEmailSummary(results);
}

export async function enviarLiquidacionCerradaEmails(liquidacionId: number) {
  return procesarEnviosLiquidacion({
    liquidacionId,
    tipoEnvio: EMAIL_TIPO_ENVIO.LIQUIDACION_CIERRE,
    onlyPendientes: false,
  });
}

export async function enviarRecordatoriosPendientes(liquidacionId: number) {
  return procesarEnviosLiquidacion({
    liquidacionId,
    tipoEnvio: EMAIL_TIPO_ENVIO.RECORDATORIO_VENCIMIENTO,
    onlyPendientes: true,
  });
}
