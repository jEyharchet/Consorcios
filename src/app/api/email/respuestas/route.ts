import { NextResponse } from "next/server";

import { ingestRespuestaEmail } from "@/lib/email-replies";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.EMAIL_INBOUND_SECRET?.trim();

  if (!configuredSecret) {
    return true;
  }

  const providedSecret = request.headers.get("x-email-inbound-secret")?.trim();
  return providedSecret === configuredSecret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const consorcioId =
      Number.isInteger(Number(body?.consorcioId)) && Number(body.consorcioId) > 0
        ? Number(body.consorcioId)
        : null;

    const respuesta = await ingestRespuestaEmail({
      consorcioId,
      fromEmail: body?.fromEmail,
      fromNombre: body?.fromNombre,
      toEmail: body?.toEmail,
      subject: body?.subject,
      bodyTexto: body?.bodyTexto,
      bodyHtml: body?.bodyHtml,
      messageId: body?.messageId,
      inReplyTo: body?.inReplyTo,
      receivedAt: body?.receivedAt,
    });

    return NextResponse.json({ ok: true, id: respuesta.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
