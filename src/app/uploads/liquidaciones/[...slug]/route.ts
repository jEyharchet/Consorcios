import { readFile } from "fs/promises";

import { ensureLiquidacionArchivoAvailable } from "@/lib/liquidacion-archivo-runtime";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function getContentType(fileName: string) {
  return fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
}

export async function GET(
  _req: Request,
  { params }: { params: { slug: string[] } },
) {
  const slug = params.slug ?? [];
  if (slug.length === 0) {
    return new Response("Archivo no encontrado", { status: 404 });
  }

  const rutaArchivo = `/uploads/liquidaciones/${slug.join("/")}`;
  const archivo = await prisma.liquidacionArchivo.findFirst({
    where: { rutaArchivo },
    select: {
      liquidacionId: true,
      tipoArchivo: true,
      nombreArchivo: true,
      rutaArchivo: true,
      mimeType: true,
      responsableGroupKey: true,
    },
  });

  if (!archivo) {
    return new Response("Archivo no encontrado", { status: 404 });
  }

  const absolutePath = await ensureLiquidacionArchivoAvailable({
    liquidacionId: archivo.liquidacionId,
    rutaArchivo: archivo.rutaArchivo,
    tipoArchivo: archivo.tipoArchivo,
    responsableGroupKey: archivo.responsableGroupKey,
    nombreArchivo: archivo.nombreArchivo,
  });
  if (!absolutePath) {
    return new Response("Archivo no disponible", { status: 404 });
  }

  const content = await readFile(absolutePath);

  return new Response(content, {
    headers: {
      "Content-Type": archivo.mimeType || getContentType(archivo.nombreArchivo),
      "Content-Disposition": `inline; filename="${archivo.nombreArchivo}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
