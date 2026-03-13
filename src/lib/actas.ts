import { Buffer } from "node:buffer";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type SaveActaResult =
  | {
      ok: true;
      data: {
        actaNombreOriginal: string;
        actaMimeType: string;
        actaSubidaAt: Date;
        actaContenido: Buffer;
      };
    }
  | { ok: false; code: "invalid_type" | "max_size" | "write_error" };

export function isFileProvided(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.size > 0;
}

export function buildAdministradorActaPath(relacionId: number) {
  return `/api/consorcio-administradores/${relacionId}/acta`;
}

export async function saveActaFile(file: File): Promise<SaveActaResult> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, code: "invalid_type" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, code: "max_size" };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();

    return {
      ok: true,
      data: {
        actaNombreOriginal: file.name,
        actaMimeType: file.type,
        actaSubidaAt: new Date(),
        actaContenido: Buffer.from(arrayBuffer),
      },
    };
  } catch {
    return { ok: false, code: "write_error" };
  }
}

export const actaValidationMessages = {
  invalid_type: "El archivo debe ser PDF, JPG, PNG o WEBP.",
  max_size: "El archivo supera el tamano maximo de 10 MB.",
  write_error: "No se pudo procesar el archivo del acta. Intenta nuevamente.",
};
