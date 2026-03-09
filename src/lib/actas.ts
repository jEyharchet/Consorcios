import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACTAS_UPLOAD_RELATIVE_DIR = path.join("uploads", "actas");
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type SaveActaResult =
  | { ok: true; data: { actaNombreOriginal: string; actaMimeType: string; actaPath: string; actaSubidaAt: Date } }
  | { ok: false; code: "invalid_type" | "max_size" | "write_error" };

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return "";
  }
}

export function isFileProvided(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.size > 0;
}

export async function saveActaFile(file: File): Promise<SaveActaResult> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, code: "invalid_type" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, code: "max_size" };
  }

  const ext = extensionFromMimeType(file.type);
  const filename = `${Date.now()}-${randomUUID()}${ext}`;
  const absoluteDir = path.join(process.cwd(), "public", ACTAS_UPLOAD_RELATIVE_DIR);
  const absolutePath = path.join(absoluteDir, filename);
  const publicPath = `/${ACTAS_UPLOAD_RELATIVE_DIR.replace(/\\/g, "/")}/${filename}`;

  try {
    await mkdir(absoluteDir, { recursive: true });
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(absolutePath, Buffer.from(arrayBuffer));

    return {
      ok: true,
      data: {
        actaNombreOriginal: file.name,
        actaMimeType: file.type,
        actaPath: publicPath,
        actaSubidaAt: new Date(),
      },
    };
  } catch {
    return { ok: false, code: "write_error" };
  }
}

export const actaValidationMessages = {
  invalid_type: "El archivo debe ser PDF, JPG, PNG o WEBP.",
  max_size: "El archivo supera el tamano maximo de 10 MB.",
  write_error: "No se pudo guardar el archivo. Intenta nuevamente.",
};
