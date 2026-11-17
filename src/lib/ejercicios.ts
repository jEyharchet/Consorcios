// Reglas puras de ejercicios económicos por consorcio (sin acceso a datos).
//
// Convención de fechas: un ejercicio se define por fechas de calendario
// (`@db.Date`), que Prisma devuelve como medianoche UTC. Los registros
// operativos cargados como "AAAA-MM-DD" se guardan hoy con
// `new Date("AAAA-MM-DDT00:00:00")`, que en Vercel (UTC) queda 00:00Z y en local
// (-03) queda 03:00Z: en ambos casos la parte de fecha UTC coincide con el día
// cargado. Por eso el rango de consulta usa límites en UTC.

export const ESTADOS_EJERCICIO = ["ABIERTO", "CERRADO"] as const;
export type EstadoEjercicio = (typeof ESTADOS_EJERCICIO)[number];

export const ESTADOS_APERTURA = ["PENDIENTE", "CERO_CONFIRMADO", "INFORMADA"] as const;
export type EstadoApertura = (typeof ESTADOS_APERTURA)[number];

/** Plazo de rendición documentada posterior al cierre (art. 2067 inc. e CCyC). */
export const DIAS_RENDICION_DEFAULT = 60;

const DIA_MS = 24 * 60 * 60 * 1000;

export type EjercicioPeriodo = {
  id?: number;
  numero?: number;
  fechaInicio: Date;
  fechaFin: Date;
  estado?: string;
};

/** "AAAA-MM-DD" → Date a medianoche UTC. Devuelve null si la fecha no existe. */
export function parseFechaCalendario(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** Date → "AAAA-MM-DD" según la fecha UTC. */
export function formatFechaCalendario(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Date → "DD/MM/AAAA" para la UI. */
export function formatFechaCalendarioAR(date: Date): string {
  const [y, m, d] = formatFechaCalendario(date).split("-");
  return `${d}/${m}/${y}`;
}

/** Fecha de calendario de hoy en Argentina, como medianoche UTC. */
export function hoyFechaCalendarioAR(ahora = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  return parseFechaCalendario(partes) ?? aFechaCalendario(ahora);
}

/** Días corridos desde `desde` hasta `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((aFechaCalendario(hasta).getTime() - aFechaCalendario(desde).getTime()) / DIA_MS);
}

/** Normaliza cualquier Date a la medianoche UTC de su fecha UTC. */
export function aFechaCalendario(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function sumarDias(date: Date, dias: number): Date {
  return new Date(aFechaCalendario(date).getTime() + dias * DIA_MS);
}

/**
 * Vencimiento de la rendición: días corridos desde el cierre (art. 6 CCyC).
 * Ej.: cierre 30/09/2026 + 60 días = 29/11/2026.
 */
export function calcularVencimientoRendicion(fechaFin: Date, dias = DIAS_RENDICION_DEFAULT): Date {
  return sumarDias(fechaFin, dias);
}

/** Cantidad de días del ejercicio, ambos extremos inclusive. */
export function duracionEnDias(periodo: Pick<EjercicioPeriodo, "fechaInicio" | "fechaFin">): number {
  return (
    Math.round((aFechaCalendario(periodo.fechaFin).getTime() - aFechaCalendario(periodo.fechaInicio).getTime()) / DIA_MS) + 1
  );
}

/** Filtro Prisma para registros con fecha dentro del ejercicio: `{ gte, lt }`. */
export function rangoConsultaEjercicio(periodo: Pick<EjercicioPeriodo, "fechaInicio" | "fechaFin">) {
  return {
    gte: aFechaCalendario(periodo.fechaInicio),
    lt: sumarDias(periodo.fechaFin, 1),
  };
}

export function fechaEnEjercicio(fecha: Date, periodo: Pick<EjercicioPeriodo, "fechaInicio" | "fechaFin">): boolean {
  const { gte, lt } = rangoConsultaEjercicio(periodo);
  const t = fecha.getTime();
  return t >= gte.getTime() && t < lt.getTime();
}

export function ejercicioDeFecha<T extends EjercicioPeriodo>(fecha: Date, ejercicios: T[]): T | null {
  return ejercicios.find((ejercicio) => fechaEnEjercicio(fecha, ejercicio)) ?? null;
}

/**
 * Sugiere el ejercicio siguiente: empieza el día posterior al cierre y dura un
 * año. Es solo una sugerencia; el usuario puede cambiar el fin (ejercicios de
 * transición por cambio de fecha de cierre).
 */
export function sugerirSiguienteEjercicio(anterior: Pick<EjercicioPeriodo, "fechaFin">) {
  const fechaInicio = sumarDias(anterior.fechaFin, 1);
  const unAnioDespues = new Date(
    Date.UTC(fechaInicio.getUTCFullYear() + 1, fechaInicio.getUTCMonth(), fechaInicio.getUTCDate()),
  );
  // Si el inicio es 29/02, Date.UTC desborda a 01/03: restar un día da 28/02 o 29/02 según corresponda.
  const fechaFin = sumarDias(unAnioDespues, -1);
  return { fechaInicio, fechaFin, vencimientoRendicion: calcularVencimientoRendicion(fechaFin) };
}

/** True si el período dura exactamente un año calendario (p. ej. 01/10 a 30/09). */
export function esPeriodoAnual(periodo: Pick<EjercicioPeriodo, "fechaInicio" | "fechaFin">): boolean {
  const esperado = sugerirSiguienteEjercicio({ fechaFin: sumarDias(periodo.fechaInicio, -1) }).fechaFin;
  return aFechaCalendario(periodo.fechaFin).getTime() === esperado.getTime();
}

export type ResultadoValidacionEjercicio = {
  errores: string[];
  advertencias: string[];
};

/**
 * Valida un ejercicio nuevo o editado contra los demás del mismo consorcio.
 *
 * Errores: fechas invertidas, vencimiento anterior al cierre, superposición,
 * huecos entre ejercicios consecutivos y edición de un ejercicio cerrado.
 * Advertencias: duración distinta de un año (válida para primeros ejercicios o
 * de transición, pero conviene que el usuario la confirme con su fundamento).
 */
export function validarEjercicio(
  candidato: EjercicioPeriodo & { vencimientoRendicion?: Date | null; fundamento?: string | null },
  existentes: EjercicioPeriodo[],
): ResultadoValidacionEjercicio {
  const errores: string[] = [];
  const advertencias: string[] = [];

  const inicio = aFechaCalendario(candidato.fechaInicio);
  const fin = aFechaCalendario(candidato.fechaFin);

  if (fin.getTime() < inicio.getTime()) {
    errores.push("La fecha de fin no puede ser anterior a la fecha de inicio.");
    return { errores, advertencias };
  }

  if (candidato.vencimientoRendicion && aFechaCalendario(candidato.vencimientoRendicion).getTime() < fin.getTime()) {
    errores.push("El vencimiento de la rendición no puede ser anterior al cierre del ejercicio.");
  }

  const otros = existentes.filter((e) => candidato.id === undefined || e.id !== candidato.id);
  const original = candidato.id !== undefined ? existentes.find((e) => e.id === candidato.id) : undefined;

  if (original?.estado === "CERRADO") {
    errores.push("El ejercicio está cerrado: no se pueden modificar sus fechas. Registrar una rectificación.");
  }

  for (const otro of otros) {
    const seSuperpone =
      inicio.getTime() <= aFechaCalendario(otro.fechaFin).getTime() &&
      aFechaCalendario(otro.fechaInicio).getTime() <= fin.getTime();
    if (seSuperpone) {
      const etiqueta = otro.numero !== undefined ? `el ejercicio N.º ${otro.numero}` : "otro ejercicio";
      errores.push(
        `Se superpone con ${etiqueta} (${formatFechaCalendarioAR(otro.fechaInicio)}–${formatFechaCalendarioAR(otro.fechaFin)}).`,
      );
    }
  }

  if (errores.length === 0) {
    const ordenados = [...otros, { ...candidato, fechaInicio: inicio, fechaFin: fin }].sort(
      (a, b) => aFechaCalendario(a.fechaInicio).getTime() - aFechaCalendario(b.fechaInicio).getTime(),
    );
    for (let i = 1; i < ordenados.length; i++) {
      const esperado = sumarDias(ordenados[i - 1].fechaFin, 1);
      if (aFechaCalendario(ordenados[i].fechaInicio).getTime() !== esperado.getTime()) {
        errores.push(
          `Hay un hueco entre el ejercicio que cierra el ${formatFechaCalendarioAR(ordenados[i - 1].fechaFin)} y el que empieza el ${formatFechaCalendarioAR(ordenados[i].fechaInicio)}: cada ejercicio debe empezar el día siguiente al cierre del anterior.`,
        );
      }
    }
  }

  const dias = duracionEnDias({ fechaInicio: inicio, fechaFin: fin });
  if (!esPeriodoAnual({ fechaInicio: inicio, fechaFin: fin })) {
    advertencias.push(
      `El ejercicio dura ${dias} días, no un año calendario completo. Es válido para un primer ejercicio o un cambio de fecha de cierre: dejar registrado el fundamento.`,
    );
    if (!candidato.fundamento?.trim()) {
      advertencias.push("Falta el fundamento (reglamento o acta) del período irregular.");
    }
  }

  return { errores, advertencias };
}
