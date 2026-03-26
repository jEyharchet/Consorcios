import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const EMAIL_RESPUESTA_ESTADO = {
  PENDIENTE: "PENDIENTE",
  LEIDA: "LEIDA",
  RESUELTA: "RESUELTA",
} as const;

export type EmailRespuestaEstado =
  (typeof EMAIL_RESPUESTA_ESTADO)[keyof typeof EMAIL_RESPUESTA_ESTADO];

type IngestRespuestaEmailInput = {
  consorcioId?: number | null;
  fromEmail: string;
  fromNombre?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  bodyTexto?: string | null;
  bodyHtml?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  receivedAt?: Date | string | null;
};

function normalizeHeaderId(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const withoutAngles = trimmed.replace(/^<+|>+$/g, "");
  return withoutAngles || null;
}

export function normalizeEmailAddress(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? "";
  return EMAIL_REGEX.test(value) ? value : null;
}

export function createEmailReplyKey() {
  return randomUUID().replaceAll("-", "");
}

export function getEmailReplyDomain() {
  const domain = process.env.EMAIL_REPLY_DOMAIN?.trim().toLowerCase() ?? "";
  return domain || null;
}

export function buildReplyToAddress(replyKey: string | null | undefined) {
  const domain = getEmailReplyDomain();

  if (!replyKey || !domain) {
    return null;
  }

  return `respuestas+${replyKey}@${domain}`;
}

export function extractReplyKeyFromAddress(value: string | null | undefined) {
  const email = normalizeEmailAddress(value);

  if (!email) {
    return null;
  }

  const [localPart] = email.split("@");
  const match = localPart?.match(/^respuestas\+([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function htmlToText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getRespuestaBodyText(params: {
  bodyTexto?: string | null;
  bodyHtml?: string | null;
}) {
  return params.bodyTexto?.trim() || htmlToText(params.bodyHtml) || "";
}

export function getRespuestaBodyPreview(params: {
  bodyTexto?: string | null;
  bodyHtml?: string | null;
}) {
  const text = getRespuestaBodyText(params);
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

async function findPersonaByEmail(email: string) {
  const personas = await prisma.persona.findMany({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 2,
  });

  if (personas.length !== 1) {
    return null;
  }

  return personas[0];
}

async function findEnvioForReply(params: { inReplyTo?: string | null; toEmail?: string | null }) {
  const replyKey = extractReplyKeyFromAddress(params.toEmail);

  if (replyKey) {
    const byReplyKey = await prisma.envioEmail.findFirst({
      where: { replyKey },
      select: {
        id: true,
        consorcioId: true,
        asambleaId: true,
      },
    });

    if (byReplyKey) {
      return byReplyKey;
    }
  }

  const inReplyTo = normalizeHeaderId(params.inReplyTo);

  if (!inReplyTo) {
    return null;
  }

  return prisma.envioEmail.findFirst({
    where: {
      providerMessageId: inReplyTo,
    },
    select: {
      id: true,
      consorcioId: true,
      asambleaId: true,
    },
  });
}

export async function ingestRespuestaEmail(input: IngestRespuestaEmailInput) {
  const fromEmail = normalizeEmailAddress(input.fromEmail);

  if (!fromEmail) {
    throw new Error("from_email_invalido");
  }

  const envio = await findEnvioForReply({
    inReplyTo: input.inReplyTo,
    toEmail: input.toEmail,
  });

  const consorcioId = envio?.consorcioId ?? (input.consorcioId && input.consorcioId > 0 ? input.consorcioId : null);

  if (!consorcioId) {
    throw new Error("consorcio_no_resuelto");
  }

  const messageId = normalizeHeaderId(input.messageId);

  if (messageId) {
    const existing = await prisma.respuestaEmail.findUnique({
      where: { messageId },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }
  }

  const persona = await findPersonaByEmail(fromEmail);
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

  if (Number.isNaN(receivedAt.getTime())) {
    throw new Error("received_at_invalido");
  }

  return prisma.respuestaEmail.create({
    data: {
      consorcioId,
      envioEmailId: envio?.id ?? null,
      asambleaId: envio?.asambleaId ?? null,
      personaId: persona?.id ?? null,
      fromEmail,
      fromNombre: input.fromNombre?.trim() || null,
      toEmail: normalizeEmailAddress(input.toEmail) ?? input.toEmail?.trim() ?? null,
      subject: input.subject?.trim() || "(sin asunto)",
      bodyTexto: input.bodyTexto?.trim() || htmlToText(input.bodyHtml) || null,
      bodyHtml: input.bodyHtml?.trim() || null,
      messageId,
      inReplyTo: normalizeHeaderId(input.inReplyTo),
      receivedAt,
      estado: EMAIL_RESPUESTA_ESTADO.PENDIENTE,
    },
  });
}
