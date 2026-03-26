import "server-only";

import { Resend, type EmailReceivedEvent } from "resend";

type WebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

type ReceivedEmailRecord = {
  emailId: string;
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

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("resend_api_key_missing");
  }

  return new Resend(apiKey);
}

function getWebhookHeaders(headers: Headers): WebhookHeaders | null {
  const id = headers.get("svix-id")?.trim() ?? "";
  const timestamp = headers.get("svix-timestamp")?.trim() ?? "";
  const signature = headers.get("svix-signature")?.trim() ?? "";

  if (!id || !timestamp || !signature) {
    return null;
  }

  return { id, timestamp, signature };
}

function getHeaderValue(headers: Record<string, string> | null, key: string) {
  if (!headers) {
    return null;
  }

  const lowerKey = key.toLowerCase();

  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === lowerKey) {
      return value;
    }
  }

  return null;
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

export function hasResendWebhookSignature(headers: Headers) {
  return Boolean(getWebhookHeaders(headers));
}

export function verifyResendWebhook(rawBody: string, headers: Headers) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new Error("resend_webhook_secret_missing");
  }

  const webhookHeaders = getWebhookHeaders(headers);

  if (!webhookHeaders) {
    throw new Error("resend_signature_missing");
  }

  const resend = getResendClient();
  return resend.webhooks.verify({
    payload: rawBody,
    headers: webhookHeaders,
    webhookSecret,
  });
}

export async function fetchReceivedEmailRecord(emailId: string): Promise<ReceivedEmailRecord> {
  const resend = getResendClient();
  const response = await resend.emails.receiving.get(emailId);

  if (response.error || !response.data) {
    throw new Error("resend_receiving_fetch_failed");
  }

  const { email: fromEmail, name: fromNombre } = parseMailbox(response.data.from);

  return {
    emailId: response.data.id,
    fromEmail: fromEmail ?? "",
    fromNombre,
    toEmail: response.data.to[0]?.trim().toLowerCase() ?? null,
    subject: response.data.subject ?? null,
    bodyTexto: response.data.text,
    bodyHtml: response.data.html,
    messageId: response.data.message_id ?? null,
    inReplyTo: getHeaderValue(response.data.headers, "In-Reply-To"),
    receivedAt: response.data.created_at ?? null,
    headers: response.data.headers,
  };
}

export function isEmailReceivedEvent(event: unknown): event is EmailReceivedEvent {
  return Boolean(
    event &&
      typeof event === "object" &&
      "type" in event &&
      "data" in event &&
      (event as { type?: string }).type === "email.received" &&
      typeof (event as { data?: { email_id?: string } }).data?.email_id === "string",
  );
}
