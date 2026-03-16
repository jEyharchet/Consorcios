import { readFile } from "fs/promises";
import path from "path";

import { generarArchivosLiquidacion, getLiquidacionesUploadsBaseDir } from "@/lib/liquidacion-cierre";
import { getLiquidacionPaso4Data } from "@/lib/liquidacion-paso4";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function buildRutaArchivo(slug: string[]) {
  return `/uploads/liquidaciones/${slug.join("/")}`;
}

function resolveArchivoPath(slug: string[]) {
  const baseDir = path.resolve(getLiquidacionesUploadsBaseDir());
  const filePath = path.resolve(baseDir, ...slug);

  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
    return null;
  }

  return filePath;
}

export async function GET(_req: Request, { params }: { params: { slug: string[] } }) {
  const slug = params.slug ?? [];
  if (slug.length === 0) {
    return new Response("Archivo no encontrado", { status: 404 });
  }

  const filePath = resolveArchivoPath(slug);
  if (!filePath) {
    return new Response("Ruta invalida", { status: 400 });
  }

  try {
    const buffer = await readFile(filePath);
    const fileName = slug[slug.length - 1] ?? "archivo.pdf";

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    const rutaArchivo = buildRutaArchivo(slug);
    const archivo = await prisma.liquidacionArchivo.findFirst({
      where: { rutaArchivo },
      select: {
        liquidacionId: true,
      },
    });

    if (!archivo) {
      return new Response("Archivo no encontrado", { status: 404 });
    }

    const data = await getLiquidacionPaso4Data(archivo.liquidacionId);
    if (!data) {
      return new Response("Liquidacion no encontrada", { status: 404 });
    }

    await generarArchivosLiquidacion(data, {
      outputKey: slug[0],
    });

    try {
      const regeneratedBuffer = await readFile(filePath);
      const fileName = slug[slug.length - 1] ?? "archivo.pdf";

      return new Response(regeneratedBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${fileName}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return new Response("Archivo no encontrado", { status: 404 });
    }
  }
}
