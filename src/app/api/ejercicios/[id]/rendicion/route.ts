import { auth } from "../../../../../../auth";

import { hasConsorcioAccessForUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generarRendicionPdf, obtenerDatosRendicion } from "@/lib/rendicion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rendición de cuentas del ejercicio en PDF, generada al momento desde la
// simulación del cierre. Solo lectura: no guarda archivos ni modifica datos.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ejercicioId = Number(params.id);
  if (!Number.isInteger(ejercicioId) || ejercicioId <= 0) {
    return new Response("Ejercicio invalido", { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("No autorizado", { status: 401 });
  }

  const ejercicio = await prisma.ejercicio.findUnique({
    where: { id: ejercicioId },
    select: { consorcioId: true, numero: true },
  });
  if (!ejercicio) {
    return new Response("Ejercicio no encontrado", { status: 404 });
  }

  if (!(await hasConsorcioAccessForUserId(userId, ejercicio.consorcioId))) {
    return new Response("Sin acceso a este consorcio", { status: 403 });
  }

  const datos = await obtenerDatosRendicion(ejercicioId, ejercicio.consorcioId);
  if (!datos) {
    return new Response("Ejercicio no encontrado", { status: 404 });
  }

  const pdf = await generarRendicionPdf(datos);
  const nombre = `rendicion-${datos.consorcio.nombre}-ejercicio-${ejercicio.numero}.pdf`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.-]+/g, "-");

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
