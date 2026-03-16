import { readFile } from "fs/promises";
import path from "path";

import { getLiquidacionesUploadsBaseDir } from "@/lib/liquidacion-cierre";

export const runtime = "nodejs";

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
    return new Response("Archivo no encontrado", { status: 404 });
  }
}
