import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type ParsedMailgunInbound = {
  fromEmail: string;
  fromNombre: string | null;
  toEmail: string | null;
  subject: string | null;
  bodyTexto: string | null;
  bodyHtml: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  receivedAt: string | null;
  headers: Record<string, string> | null;
};

const MAILGUN_SIGNATURE_MAX_AGE_SECONDS = 15 * 60;

function getMailgunSigningKey() {
  return (
    process.env.MAILGUN_SIGNING_KEY?.trim() ||
    process.env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim() ||
    null
  );
}

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : null;
}

function parseMailbox(value: string | null | undefined) {
  const raw = value?.trim();

  if (!raw) {
    return { email: null, name: null };
  }

  const angleMatch = raw.match(/^(.*)<([^<>]+)>$/);

  if (angleMatch) {
    return {
      name: angleMatch[1]?.trim().replace(/^"|"$/g, "") || null,
      email: angleMatch[2]?.trim().toLowerCase() || null,
    };
  }

  return {
    name: null,
    email: raw.toLowerCase(),
  };
}

function getHeaderValue(headers: Record<string, string> | null, key: string) {
  if (!headers) {
    return null;
  }

  const normalizedKey = key.toLowerCase();

  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === normalizedKey) {
      return value;
    }
  }

  return null;
}

function parseMessageHeaders(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    const headers: Record<string, string> = {};

    for (const item of parsed) {
      if (!Array.isArray(item) || item.length < 2) {
        continue;
      }

      const [rawKey, rawValue] = item;

      if (typeof rawKey !== "string" || typeof rawValue !== "string") {
        continue;
      }

      headers[rawKey] = rawValue;
    }

    return Object.keys(headers).length > 0 ? headers : null;
  } catch {
    return null;
  }
}

function verifyMailgunSignature(formData: FormData) {
  const signingKey = getMailgunSigningKey();

  if (!signingKey) {
    throw new Error("mailgun_signing_key_missing");
  }

  const timestamp = getStringValue(formData, "timestamp");
  const token = getStringValue(formData, "token");
  const signature = getStringValue(formData, "signature");

  if (!timestamp || !token || !signature) {
    throw new Error("mailgun_signature_missing");
  }

  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    throw new Error("mailgun_timestamp_invalido");
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);

  if (ageSeconds > MAILGUN_SIGNATURE_MAX_AGE_SECONDS) {
    throw new Error("mailgun_signature_expired");
  }

  const expectedSignature = createHmac("sha256", signingKey).update(`${timestamp}${token}`).digest("hex");
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("mailgun_signature_invalid");
  }
}

export function isMailgunContentType(contentType: string | null) {
  const value = contentType?.toLowerCase() ?? "";
  return (
    value.includes("application/x-www-form-urlencoded") ||
    value.includes("multipart/form-data")
  );
}

export async function parseMailgunInbound(request: Request): Promise<ParsedMailgunInbound> {
  const formData = await request.formData();
  verifyMailgunSignature(formData);

  const headers = parseMessageHeaders(getStringValue(formData, "message-headers"));
  const sender = getStringValue(formData, "sender");
  const from = getStringValue(formData, "from") || sender;
  const recipient = getStringValue(formData, "recipient");
  const messageId =
    getHeaderValue(headers, "Message-Id") ||
    getHeaderValue(headers, "Message-ID") ||
    getStringValue(formData, "Message-Id") ||
    getStringValue(formData, "message-id");
  const inReplyTo =
    getHeaderValue(headers, "In-Reply-To") ||
    getStringValue(formData, "In-Reply-To") ||
    getStringValue(formData, "in-reply-to");
  const receivedAt =
    getStringValue(formData, "Date") ||
    getStringValue(formData, "date") ||
    null;

  const { email: fromEmail, name: fromNombre } = parseMailbox(from);

  return {
    fromEmail: fromEmail ?? "",
    fromNombre,
    toEmail: recipient?.toLowerCase() ?? null,
    subject: getStringValue(formData, "subject"),
    bodyTexto: getStringValue(formData, "body-plain"),
    bodyHtml: getStringValue(formData, "body-html"),
    messageId,
    inReplyTo,
    receivedAt,
    headers,
  };
}
