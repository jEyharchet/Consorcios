import { auth } from "../../auth";

import { hasConsorcioAccessForUserId } from "./auth";
import { obtenerCierre } from "./cierre-confirmacion";
import { prisma } from "./prisma";
import { generarHojaLibroAdministracionPdf, generarRendicionPdf, obtenerDatosRendicion } from "./rendicion";

type Documento = "rendicion" | "libro";

function nombreArchivo(base: string) {
  return base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.-]+/g, "-");
}

/**
 * PDF de la rendición o de la hoja del libro de un ejercicio.
 * - `?version=N`: la versión N confirmada (vigente o reabierta), tal como se guardó.
 * - Sin versión, con el ejercicio cerrado: la versión vigente guardada.
 * - Sin versión, con el ejercicio abierto: un borrador generado al momento.
 */
export async function responderPdfEjercicio(req: Request, idParam: string, documento: Documento) {
  const ejercicioId = Number(idParam);
  if (!Number.isInteger(ejercicioId) || ejercicioId <= 0) {
    return new Response("Ejercicio invalido", { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("No autorizado", { status: 401 });

  const ejercicio = await prisma.ejercicio.findUnique({
    where: { id: ejercicioId },
    select: { consorcioId: true, numero: true, estado: true, consorcio: { select: { nombre: true } } },
  });
  if (!ejercicio) return new Response("Ejercicio no encontrado", { status: 404 });
  if (!(await hasConsorcioAccessForUserId(userId, ejercicio.consorcioId))) {
    return new Response("Sin acceso a este consorcio", { status: 403 });
  }

  const versionParam = new URL(req.url).searchParams.get("version");
  const versionPedida = versionParam ? Number(versionParam) : null;
  if (versionParam && (!Number.isInteger(versionPedida) || (versionPedida ?? 0) <= 0)) {
    return new Response("Version invalida", { status: 400 });
  }

  const base =
    documento === "rendicion"
      ? `rendicion-${ejercicio.consorcio.nombre}-ejercicio-${ejercicio.numero}`
      : `libro-administracion-${ejercicio.consorcio.nombre}-cierre-ejercicio-${ejercicio.numero}`;

  let pdf: Buffer;
  let nombre: string;
  if (versionPedida || ejercicio.estado === "CERRADO") {
    const cierre = await obtenerCierre(ejercicioId, versionPedida ?? undefined);
    if (!cierre) return new Response("Version no encontrada", { status: 404 });
    pdf = Buffer.from(documento === "rendicion" ? cierre.rendicionPdf : cierre.hojaLibroPdf);
    nombre = nombreArchivo(`${base}-v${cierre.version}.pdf`);
  } else {
    const rendicion = await obtenerDatosRendicion(ejercicioId, ejercicio.consorcioId);
    if (!rendicion) return new Response("Ejercicio no encontrado", { status: 404 });
    pdf =
      documento === "rendicion"
        ? await generarRendicionPdf(rendicion.datos, rendicion.archivos)
        : await generarHojaLibroAdministracionPdf(rendicion.datos);
    nombre = nombreArchivo(`${base}-borrador.pdf`);
  }

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
