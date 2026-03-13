import { Buffer } from "node:buffer";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type SaveComprobantePagoResult =
  | {
      ok: true;
      data: {
        comprobanteNombreOriginal: string;
        comprobanteMimeType: string;
        comprobanteSubidoAt: Date;
        comprobanteContenido: Buffer;
      };
    }
  | { ok: false; code: "invalid_type" | "max_size" | "write_error" };

export function isFileProvided(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.size > 0;
}

export function buildPagoComprobantePath(pagoId: number) {
  return `/api/pagos/${pagoId}/comprobante`;
}

export async function saveComprobantePagoFile(file: File): Promise<SaveComprobantePagoResult> {
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
        comprobanteNombreOriginal: file.name,
        comprobanteMimeType: file.type,
        comprobanteSubidoAt: new Date(),
        comprobanteContenido: Buffer.from(arrayBuffer),
      },
    };
  } catch {
    return { ok: false, code: "write_error" };
  }
}

export const comprobantePagoValidationMessages = {
  invalid_type: "El comprobante debe ser PDF, JPG, PNG o WEBP.",
  max_size: "El comprobante supera el tamano maximo de 10 MB.",
  write_error: "No se pudo procesar el comprobante. Intenta nuevamente.",
};
