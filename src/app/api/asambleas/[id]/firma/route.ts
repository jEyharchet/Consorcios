import { auth } from "../../../../../../auth";

import { hasConsorcioAccessForUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return new Response("Firma invalida", { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("No autorizado", { status: 401 });
  }

  const asamblea = await prisma.asamblea.findUnique({
    where: { id },
    select: {
      consorcioId: true,
      firmaNombreOriginal: true,
      firmaMimeType: true,
      firmaContenido: true,
    },
  });

  if (!asamblea || !asamblea.firmaContenido) {
    return new Response("Firma no encontrada", { status: 404 });
  }

  const allowed = await hasConsorcioAccessForUserId(userId, asamblea.consorcioId);
  if (!allowed) {
    return new Response("Sin acceso a este consorcio", { status: 403 });
  }

  return new Response(asamblea.firmaContenido, {
    headers: {
      "Content-Type": asamblea.firmaMimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${asamblea.firmaNombreOriginal ?? `firma-asamblea-${id}`}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
