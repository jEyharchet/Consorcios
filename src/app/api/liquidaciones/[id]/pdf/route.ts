import puppeteer from "puppeteer";

import { auth } from "../../../../../../auth";
import { buildLiquidacionPdfHtml } from "../../../../../lib/liquidacion-pdf-html";
import { getLiquidacionPaso4Data } from "../../../../../lib/liquidacion-paso4";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return new Response("Liquidacion invalida", { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("No autorizado", { status: 401 });
  }

  const data = await getLiquidacionPaso4Data(id);
  if (!data) {
    return new Response("Liquidacion no encontrada", { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, activo: true },
  });

  if (!user || !user.activo) {
    return new Response("No autorizado", { status: 401 });
  }

  if (user.role !== "SUPER_ADMIN") {
    const assignment = await prisma.userConsorcio.findFirst({
      where: {
        userId: user.id,
        consorcioId: data.liquidacion.consorcioId,
      },
      select: { id: true },
    });

    if (!assignment) {
      return new Response("Sin acceso a este consorcio", { status: 403 });
    }
  }

  const html = buildLiquidacionPdfHtml(data);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="liquidacion-${id}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
