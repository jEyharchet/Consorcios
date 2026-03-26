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

type IngestRespuestaEmailDiagnostics = {
  log?: (event: string, metadata?: Record<string, unknown>) => void;
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

async function findPersonaByEmail(email: string, diagnostics?: IngestRespuestaEmailDiagnostics) {
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

  diagnostics?.log?.("association.persona.email", {
    email,
    candidates: personas.length,
    personaId: personas.length === 1 ? personas[0].id : null,
  });

  if (personas.length !== 1) {
    return null;
  }

  return personas[0];
}

async function findEnvioForReply(
  params: { inReplyTo?: string | null; toEmail?: string | null },
  diagnostics?: IngestRespuestaEmailDiagnostics,
) {
  const inReplyTo = normalizeHeaderId(params.inReplyTo);

  if (inReplyTo) {
    const byProviderMessageId = await prisma.envioEmail.findFirst({
      where: {
        providerMessageId: inReplyTo,
      },
      select: {
        id: true,
        consorcioId: true,
        asambleaId: true,
      },
    });

    diagnostics?.log?.("association.envio.in_reply_to", {
      inReplyTo,
      envioEmailId: byProviderMessageId?.id ?? null,
      consorcioId: byProviderMessageId?.consorcioId ?? null,
    });

    if (byProviderMessageId) {
      return byProviderMessageId;
    }
  } else {
    diagnostics?.log?.("association.envio.in_reply_to", {
      inReplyTo: null,
      envioEmailId: null,
    });
  }

  const replyKey = extractReplyKeyFromAddress(params.toEmail);

  diagnostics?.log?.("association.envio.reply_key", {
    toEmail: params.toEmail ?? null,
    replyKey,
  });

  if (!replyKey) {
    return null;
  }

  const byReplyKey = await prisma.envioEmail.findFirst({
    where: { replyKey },
    select: {
      id: true,
      consorcioId: true,
      asambleaId: true,
    },
  });

  diagnostics?.log?.("association.envio.reply_key.result", {
    replyKey,
    envioEmailId: byReplyKey?.id ?? null,
    consorcioId: byReplyKey?.consorcioId ?? null,
  });

  return byReplyKey;
}

export async function ingestRespuestaEmail(
  input: IngestRespuestaEmailInput,
  diagnostics?: IngestRespuestaEmailDiagnostics,
) {
  const fromEmail = normalizeEmailAddress(input.fromEmail);

  diagnostics?.log?.("ingest.start", {
    fromEmail,
    toEmail: input.toEmail ?? null,
    subject: input.subject?.trim() || "(sin asunto)",
    messageId: normalizeHeaderId(input.messageId),
    inReplyTo: normalizeHeaderId(input.inReplyTo),
  });

  if (!fromEmail) {
    diagnostics?.log?.("ingest.reject", { reason: "from_email_invalido" });
    throw new Error("from_email_invalido");
  }

  const envio = await findEnvioForReply({
    inReplyTo: input.inReplyTo,
    toEmail: input.toEmail,
  }, diagnostics);

  const consorcioId = envio?.consorcioId ?? (input.consorcioId && input.consorcioId > 0 ? input.consorcioId : null);

  diagnostics?.log?.("association.consorcio", {
    consorcioId,
    envioEmailId: envio?.id ?? null,
  });

  if (!consorcioId) {
    diagnostics?.log?.("ingest.reject", { reason: "consorcio_no_resuelto" });
    throw new Error("consorcio_no_resuelto");
  }

  const messageId = normalizeHeaderId(input.messageId);

  if (messageId) {
    const existing = await prisma.respuestaEmail.findUnique({
      where: { messageId },
      select: { id: true },
    });

    diagnostics?.log?.("dedupe.message_id", {
      messageId,
      existingRespuestaEmailId: existing?.id ?? null,
    });

    if (existing) {
      diagnostics?.log?.("ingest.skip_existing", {
        reason: "message_id_duplicate",
        respuestaEmailId: existing.id,
      });
      return existing;
    }
  } else {
    diagnostics?.log?.("dedupe.message_id", {
      messageId: null,
      existingRespuestaEmailId: null,
    });
  }

  const persona = await findPersonaByEmail(fromEmail, diagnostics);
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

  if (Number.isNaN(receivedAt.getTime())) {
    diagnostics?.log?.("ingest.reject", { reason: "received_at_invalido" });
    throw new Error("received_at_invalido");
  }

  const created = await prisma.respuestaEmail.create({
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

  diagnostics?.log?.("ingest.created", {
    respuestaEmailId: created.id,
    consorcioId,
    envioEmailId: envio?.id ?? null,
    personaId: persona?.id ?? null,
  });

  return created;
}
