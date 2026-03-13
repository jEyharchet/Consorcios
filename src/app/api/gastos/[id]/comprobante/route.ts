import { auth } from "../../../../../../auth";

import { hasConsorcioAccessForUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return new Response("Comprobante invalido", { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return new Response("No autorizado", { status: 401 });
  }

  const gasto = await prisma.gasto.findUnique({
    where: { id },
    select: {
      consorcioId: true,
      comprobanteNombreOriginal: true,
      comprobanteMimeType: true,
      comprobanteContenido: true,
    },
  });

  if (!gasto) {
    return new Response("Comprobante no encontrado", { status: 404 });
  }

  const allowed = await hasConsorcioAccessForUserId(userId, gasto.consorcioId);
  if (!allowed) {
    return new Response("Sin acceso a este consorcio", { status: 403 });
  }

  if (!gasto.comprobanteContenido) {
    return new Response("Comprobante no encontrado", { status: 404 });
  }

  return new Response(gasto.comprobanteContenido, {
    headers: {
      "Content-Type": gasto.comprobanteMimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${gasto.comprobanteNombreOriginal ?? `comprobante-gasto-${id}`}"`,
    },
  });
}
