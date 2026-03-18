import "server-only";

import { Buffer } from "node:buffer";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type SaveAsambleaFirmaResult =
  | {
      ok: true;
      data: {
        firmaNombreOriginal: string;
        firmaMimeType: string;
        firmaContenido: Buffer;
        firmaSubidaAt: Date;
      };
    }
  | { ok: false; code: "invalid_type" | "max_size" | "write_error" };

export function isFirmaFileProvided(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.size > 0;
}

export async function saveFirmaFile(file: File): Promise<SaveAsambleaFirmaResult> {
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
        firmaNombreOriginal: file.name,
        firmaMimeType: file.type,
        firmaContenido: Buffer.from(arrayBuffer),
        firmaSubidaAt: new Date(),
      },
    };
  } catch {
    return { ok: false, code: "write_error" };
  }
}

export const saveAsambleaFirmaFile = saveFirmaFile;

export function buildAsambleaFirmaPath(asambleaId: number) {
  return `/api/asambleas/${asambleaId}/firma`;
}

export function buildAdministradorFirmaPath(relacionId: number) {
  return `/api/consorcio-administradores/${relacionId}/firma`;
}

export const firmaValidationMessages = {
  invalid_type: "La firma debe ser JPG, PNG o WEBP.",
  max_size: "La imagen de firma supera el tamano maximo de 5 MB.",
  write_error: "No se pudo procesar la imagen de firma. Intenta nuevamente.",
};
