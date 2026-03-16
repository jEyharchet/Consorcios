import { auth } from "../../../../../../auth";

import { hasConsorcioAccessForUserId } from "@/lib/auth";
import { buildBlankActaPdfHtml } from "@/lib/acta-blank-pdf";
import { renderPdfWithVercelTestBrowser } from "@/lib/pdf-browser-vercel-test";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const consorcioId = Number(url.searchParams.get("consorcioId"));

  if (!Number.isInteger(consorcioId) || consorcioId <= 0) {
    return new Response("Consorcio invalido", { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("No autorizado", { status: 401 });
  }

  const allowed = await hasConsorcioAccessForUserId(userId, consorcioId);
  if (!allowed) {
    return new Response("Sin acceso a este consorcio", { status: 403 });
  }

  const consorcio = await prisma.consorcio.findUnique({
    where: { id: consorcioId },
    select: { nombre: true },
  });

  if (!consorcio) {
    return new Response("Consorcio no encontrado", { status: 404 });
  }

  const origin = url.origin;
  const html = buildBlankActaPdfHtml({
    consorcioNombre: consorcio.nombre,
    logoUrl: `${origin}/branding/logo-gray-v2.png`,
  });

  const pdf = await renderPdfWithVercelTestBrowser(html);

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="acta-en-blanco.pdf"',
    },
  });
}
