import { notFound } from "next/navigation";

import { prisma } from "../../../../../lib/prisma";
import { requireConsorcioAccess } from "../../../../../lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const relacionId = Number(params.id);

  if (!Number.isInteger(relacionId)) {
    notFound();
  }

  const relacion = await prisma.consorcioAdministrador.findUnique({
    where: { id: relacionId },
    select: {
      consorcioId: true,
      firmaContenido: true,
      firmaMimeType: true,
      firmaNombreOriginal: true,
    },
  });

  if (!relacion) {
    notFound();
  }

  await requireConsorcioAccess(relacion.consorcioId);

  if (!relacion.firmaContenido) {
    notFound();
  }

  return new Response(relacion.firmaContenido, {
    headers: {
      "Content-Type": relacion.firmaMimeType ?? "image/png",
      "Content-Disposition": `inline; filename="${relacion.firmaNombreOriginal ?? "firma.png"}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
