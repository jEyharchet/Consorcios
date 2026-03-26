import { NextResponse } from "next/server";

import { ingestRespuestaEmail } from "@/lib/email-replies";
import {
  fetchReceivedEmailRecord,
  hasResendWebhookSignature,
  isEmailReceivedEvent,
  verifyResendWebhook,
} from "@/lib/resend-receiving";

function isManualAuthorized(request: Request) {
  const configuredSecret = process.env.EMAIL_INBOUND_SECRET?.trim();

  if (!configuredSecret) {
    return true;
  }

  const providedSecret = request.headers.get("x-email-inbound-secret")?.trim();
  return providedSecret === configuredSecret;
}

function isPermanentInboundError(error: string) {
  return [
    "consorcio_no_resuelto",
    "from_email_invalido",
    "received_at_invalido",
    "resend_signature_missing",
    "resend_webhook_secret_missing",
  ].includes(error);
}

async function handleManualPayload(payload: unknown, request: Request) {
  if (!isManualAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = payload as Record<string, unknown>;
  const consorcioId =
    Number.isInteger(Number(body?.consorcioId)) && Number(body.consorcioId) > 0
      ? Number(body.consorcioId)
      : null;

  const respuesta = await ingestRespuestaEmail({
    consorcioId,
    fromEmail: typeof body?.fromEmail === "string" ? body.fromEmail : "",
    fromNombre: typeof body?.fromNombre === "string" ? body.fromNombre : null,
    toEmail: typeof body?.toEmail === "string" ? body.toEmail : null,
    subject: typeof body?.subject === "string" ? body.subject : null,
    bodyTexto: typeof body?.bodyTexto === "string" ? body.bodyTexto : null,
    bodyHtml: typeof body?.bodyHtml === "string" ? body.bodyHtml : null,
    messageId: typeof body?.messageId === "string" ? body.messageId : null,
    inReplyTo: typeof body?.inReplyTo === "string" ? body.inReplyTo : null,
    receivedAt: typeof body?.receivedAt === "string" ? body.receivedAt : null,
  });

  return NextResponse.json({ ok: true, id: respuesta.id, source: "manual" });
}

async function handleResendWebhook(rawBody: string, request: Request) {
  let event;

  try {
    event = verifyResendWebhook(rawBody, request.headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "resend_webhook_invalid";
    const status =
      message === "resend_webhook_secret_missing" || message === "resend_api_key_missing" ? 500 : 401;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  if (!isEmailReceivedEvent(event)) {
    return NextResponse.json({ ok: true, ignored: true, type: (event as { type?: string }).type ?? "unknown" });
  }

  const emailId = event.data.email_id;

  try {
    const received = await fetchReceivedEmailRecord(emailId);
    const respuesta = await ingestRespuestaEmail({
      fromEmail: received.fromEmail,
      fromNombre: received.fromNombre,
      toEmail: received.toEmail,
      subject: received.subject,
      bodyTexto: received.bodyTexto,
      bodyHtml: received.bodyHtml,
      messageId: received.messageId,
      inReplyTo: received.inReplyTo,
      receivedAt: received.receivedAt,
    });

    return NextResponse.json({
      ok: true,
      id: respuesta.id,
      source: "resend",
      emailId: received.emailId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";

    if (isPermanentInboundError(message)) {
      console.warn("[email-respuestas] inbound ignored", { emailId, error: message });
      return NextResponse.json({ ok: true, ignored: true, error: message, emailId });
    }

    console.error("[email-respuestas] resend inbound failed", { emailId, error: message });
    return NextResponse.json({ ok: false, error: message, emailId }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return NextResponse.json({ ok: false, error: "empty_payload" }, { status: 400 });
  }

  if (hasResendWebhookSignature(request.headers)) {
    return handleResendWebhook(rawBody, request);
  }

  try {
    const payload = JSON.parse(rawBody) as unknown;
    return await handleManualPayload(payload, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
