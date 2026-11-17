import { Buffer } from "node:buffer";

// Comprobantes de gastos: se guardan como Bytes en la base. El límite queda por
// debajo de los 4,5 MB que acepta Vercel por request (ver next.config.mjs,
// serverActions.bodySizeLimit).
export const MAX_COMPROBANTE_GASTO_BYTES = 4 * 1024 * 1024;
export const MAX_COMPROBANTE_GASTO_LABEL = "4 MB";
export const TIPOS_COMPROBANTE_GASTO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export type ComprobanteGasto = {
  comprobanteContenido: Buffer;
  comprobanteMimeType: string;
  comprobanteNombreOriginal: string;
  comprobanteSubidoAt: Date;
};

export type LecturaComprobanteGasto =
  | { ok: true; comprobante: ComprobanteGasto | null }
  | { ok: false; error: "comprobante_muy_pesado" | "comprobante_tipo_invalido" };

/** Lee el archivo del formulario. Sin archivo devuelve `comprobante: null`. */
export async function leerComprobanteGasto(valor: FormDataEntryValue | null): Promise<LecturaComprobanteGasto> {
  if (!(valor instanceof File) || valor.size === 0) {
    return { ok: true, comprobante: null };
  }

  if (valor.size > MAX_COMPROBANTE_GASTO_BYTES) {
    return { ok: false, error: "comprobante_muy_pesado" };
  }

  if (!TIPOS_COMPROBANTE_GASTO.includes(valor.type as (typeof TIPOS_COMPROBANTE_GASTO)[number])) {
    return { ok: false, error: "comprobante_tipo_invalido" };
  }

  return {
    ok: true,
    comprobante: {
      comprobanteContenido: Buffer.from(await valor.arrayBuffer()),
      comprobanteMimeType: valor.type,
      comprobanteNombreOriginal: valor.name,
      comprobanteSubidoAt: new Date(),
    },
  };
}

export const MENSAJES_COMPROBANTE_GASTO: Record<string, string> = {
  comprobante_muy_pesado: `El comprobante no puede superar los ${MAX_COMPROBANTE_GASTO_LABEL}.`,
  comprobante_tipo_invalido: "El comprobante debe ser PDF, JPG, PNG o WEBP.",
  comprobante_requerido: "Elegí un archivo o indicá el motivo por el que no hay comprobante.",
};

/** Un gasto tiene comprobante si hay archivo guardado (en la base o, en registros viejos, en disco). */
export function tieneComprobante(gasto: { comprobanteNombreOriginal: string | null; comprobantePath: string | null }) {
  return Boolean(gasto.comprobanteNombreOriginal || gasto.comprobantePath);
}
