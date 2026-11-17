import { parseFechaCalendario } from "../../../lib/ejercicios";

export const ESTADO_APERTURA_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  CERO_CONFIRMADO: "Cero confirmado",
  INFORMADA: "Informada",
};

export const ESTADO_EJERCICIO_LABEL: Record<string, string> = {
  ABIERTO: "Abierto",
  CERRADO: "Cerrado",
};

export function inputClassName() {
  return "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:border-slate-400 focus:ring-2 disabled:bg-slate-50";
}

function texto(formData: FormData, campo: string) {
  const valor = (formData.get(campo)?.toString() ?? "").trim();
  return valor || null;
}

export type DatosFormularioEjercicio =
  | {
      ok: true;
      datos: {
        fechaInicio: Date;
        fechaFin: Date;
        vencimientoRendicion: Date | null;
        fundamento: string | null;
        observaciones: string | null;
      };
    }
  | { ok: false; errores: string[] };

export function leerFormularioEjercicio(formData: FormData): DatosFormularioEjercicio {
  const errores: string[] = [];
  const fechaInicio = parseFechaCalendario(texto(formData, "fechaInicio") ?? "");
  const fechaFin = parseFechaCalendario(texto(formData, "fechaFin") ?? "");
  const vencimientoTexto = texto(formData, "vencimientoRendicion");
  const vencimientoRendicion = vencimientoTexto ? parseFechaCalendario(vencimientoTexto) : null;

  if (!fechaInicio) errores.push("La fecha de inicio no es válida.");
  if (!fechaFin) errores.push("La fecha de fin no es válida.");
  if (vencimientoTexto && !vencimientoRendicion) errores.push("El vencimiento de la rendición no es válido.");

  if (!fechaInicio || !fechaFin || errores.length > 0) return { ok: false, errores };

  return {
    ok: true,
    datos: {
      fechaInicio,
      fechaFin,
      vencimientoRendicion,
      fundamento: texto(formData, "fundamento"),
      observaciones: texto(formData, "observaciones"),
    },
  };
}

/** Los mensajes viajan en la query separados por "|" (patrón ok/error del módulo). */
export function mensajesDesdeQuery(valor?: string) {
  return valor ? valor.split("|").filter(Boolean) : [];
}
