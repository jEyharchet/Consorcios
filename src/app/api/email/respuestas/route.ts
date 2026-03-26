import { NextResponse } from "next/server";

import { extractReplyKeyFromAddress, ingestRespuestaEmail } from "@/lib/email-replies";
import { isMailgunContentType, parseMailgunInbound } from "@/lib/mailgun-inbound";
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

function createRequestLogger(context: string) {
  return (event: string, metadata?: Record<string, unknown>) => {
    console.log(`[email-respuestas] ${context} ${event}`, metadata ?? {});
  };
}

function isPermanentInboundError(error: string) {
  return [
    "consorcio_no_resuelto",
    "from_email_invalido",
    "received_at_invalido",
    "mailgun_timestamp_invalido",
    "mailgun_signature_expired",
    "resend_signature_missing",
    "resend_webhook_secret_missing",
  ].includes(error);
}

async function handleManualPayload(payload: unknown, request: Request) {
  const log = createRequestLogger("manual");
  log("detected");

  if (!isManualAuthorized(request)) {
    log("signature.invalid", { reason: "manual_unauthorized" });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  log("signature.valid");

  const body = payload as Record<string, unknown>;
  const consorcioId =
    Number.isInteger(Number(body?.consorcioId)) && Number(body.consorcioId) > 0
      ? Number(body.consorcioId)
      : null;

  log("payload.extracted", {
    fromEmail: typeof body?.fromEmail === "string" ? body.fromEmail : null,
    recipient: typeof body?.toEmail === "string" ? body.toEmail : null,
    subject: typeof body?.subject === "string" ? body.subject : null,
    messageId: typeof body?.messageId === "string" ? body.messageId : null,
    inReplyTo: typeof body?.inReplyTo === "string" ? body.inReplyTo : null,
    replyKey:
      typeof body?.toEmail === "string" ? extractReplyKeyFromAddress(body.toEmail) : null,
  });

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
  }, { log });

  log("completed", { respuestaEmailId: respuesta.id });
  return NextResponse.json({ ok: true, id: respuesta.id, source: "manual" });
}

async function handleResendWebhook(rawBody: string, request: Request) {
  const log = createRequestLogger("resend");
  log("detected");
  let event;

  try {
    event = verifyResendWebhook(rawBody, request.headers);
    log("signature.valid");
  } catch (error) {
    const message = error instanceof Error ? error.message : "resend_webhook_invalid";
    log("signature.invalid", { reason: message });
    const status =
      message === "resend_webhook_secret_missing" || message === "resend_api_key_missing" ? 500 : 401;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  if (!isEmailReceivedEvent(event)) {
    log("ignored", { reason: "non_email_received_event", type: (event as { type?: string }).type ?? "unknown" });
    return NextResponse.json({ ok: true, ignored: true, type: (event as { type?: string }).type ?? "unknown" });
  }

  const emailId = event.data.email_id;
  log("event.received", { emailId });

  try {
    const received = await fetchReceivedEmailRecord(emailId);
    log("payload.extracted", {
      fromEmail: received.fromEmail,
      recipient: received.toEmail,
      subject: received.subject,
      messageId: received.messageId,
      inReplyTo: received.inReplyTo,
      replyKey: extractReplyKeyFromAddress(received.toEmail),
      emailId: received.emailId,
    });
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
    }, { log });

    log("completed", { respuestaEmailId: respuesta.id, emailId: received.emailId });
    return NextResponse.json({
      ok: true,
      id: respuesta.id,
      source: "resend",
      emailId: received.emailId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";

    if (isPermanentInboundError(message)) {
      log("ignored", { reason: message, emailId });
      console.warn("[email-respuestas] inbound ignored", { emailId, error: message });
      return NextResponse.json({ ok: true, ignored: true, error: message, emailId });
    }

    log("failed", { reason: message, emailId });
    console.error("[email-respuestas] resend inbound failed", { emailId, error: message });
    return NextResponse.json({ ok: false, error: message, emailId }, { status: 502 });
  }
}

async function handleMailgunInbound(request: Request) {
  const log = createRequestLogger("mailgun");
  log("detected");
  try {
    const inbound = await parseMailgunInbound(request);
    log("signature.valid");
    log("payload.extracted", {
      fromEmail: inbound.fromEmail,
      recipient: inbound.toEmail,
      subject: inbound.subject,
      messageId: inbound.messageId,
      inReplyTo: inbound.inReplyTo,
      replyKey: extractReplyKeyFromAddress(inbound.toEmail),
    });
    const respuesta = await ingestRespuestaEmail({
      fromEmail: inbound.fromEmail,
      fromNombre: inbound.fromNombre,
      toEmail: inbound.toEmail,
      subject: inbound.subject,
      bodyTexto: inbound.bodyTexto,
      bodyHtml: inbound.bodyHtml,
      messageId: inbound.messageId,
      inReplyTo: inbound.inReplyTo,
      receivedAt: inbound.receivedAt,
    }, { log });

    log("completed", { respuestaEmailId: respuesta.id });
    return NextResponse.json({ ok: true, id: respuesta.id, source: "mailgun" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    const status =
      message === "mailgun_signing_key_missing"
        ? 500
        : message === "mailgun_signature_missing" ||
            message === "mailgun_signature_invalid" ||
            message === "mailgun_signature_expired" ||
            message === "mailgun_timestamp_invalido"
          ? 401
          : isPermanentInboundError(message)
            ? 200
            : 502;

    if (status === 401) {
      log("signature.invalid", { reason: message });
    }

    if (status === 200) {
      log("ignored", { reason: message });
      console.warn("[email-respuestas] mailgun inbound ignored", { error: message });
      return NextResponse.json({ ok: true, ignored: true, error: message });
    }

    if (status >= 500) {
      log("failed", { reason: message });
      console.error("[email-respuestas] mailgun inbound failed", { error: message });
    }

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  console.log("INBOUND EMAIL HIT");
  const contentType = request.headers.get("content-type");
  console.log("[email-respuestas] request.received", {
    method: request.method,
    contentType,
    hasResendSignature: hasResendWebhookSignature(request.headers),
  });

  if (isMailgunContentType(contentType)) {
    return handleMailgunInbound(request);
  }

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
