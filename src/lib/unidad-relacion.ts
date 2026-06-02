export const TIPO_RELACION_UNIDAD = {
  RESPONSABLE: "RESPONSABLE",
  DUENO: "DUENO",
  INQUILINO: "INQUILINO",
} as const;

export type TipoRelacionUnidadValue = (typeof TIPO_RELACION_UNIDAD)[keyof typeof TIPO_RELACION_UNIDAD];

export const TIPO_RELACION_UNIDAD_OPTIONS: Array<{ value: TipoRelacionUnidadValue; label: string }> = [
  { value: TIPO_RELACION_UNIDAD.RESPONSABLE, label: "Responsable" },
  { value: TIPO_RELACION_UNIDAD.DUENO, label: "Dueño" },
  { value: TIPO_RELACION_UNIDAD.INQUILINO, label: "Inquilino" },
];

const PORCENTAJE_EPSILON = 0.05;

export function isTipoRelacionUnidadValue(value: string | null | undefined): value is TipoRelacionUnidadValue {
  return TIPO_RELACION_UNIDAD_OPTIONS.some((option) => option.value === value);
}

export type UnidadRelacionLike = {
  desde: Date;
  hasta: Date | null;
  tipoRelacion?: string | null;
  porcentajeExpensasOrdinarias?: number | null;
  porcentajeExpensasExtraordinarias?: number | null;
  recibeLiquidacion?: boolean | null;
};

function normalizeDate(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function normalizePorcentaje(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}

export function formatTipoRelacionUnidadLabel(tipoRelacion: string | null | undefined) {
  const option = TIPO_RELACION_UNIDAD_OPTIONS.find((item) => item.value === tipoRelacion);
  return option?.label ?? "Responsable";
}

export function getTiposRelacionParaNotificacionGeneral(): TipoRelacionUnidadValue[] {
  return [TIPO_RELACION_UNIDAD.RESPONSABLE, TIPO_RELACION_UNIDAD.DUENO];
}

export function getTiposRelacionParaVotacion(): TipoRelacionUnidadValue[] {
  return [TIPO_RELACION_UNIDAD.RESPONSABLE, TIPO_RELACION_UNIDAD.DUENO];
}

export function filterRelacionesUnidadVigentesPorTipos<T extends UnidadRelacionLike>(
  relaciones: T[],
  tipos: string[],
  refDate = new Date(),
) {
  const ref = normalizeDate(refDate);

  return relaciones.filter((relacion) => {
    const tipo = relacion.tipoRelacion ?? TIPO_RELACION_UNIDAD.RESPONSABLE;
    if (!tipos.includes(tipo)) {
      return false;
    }

    const desde = normalizeDate(relacion.desde);
    const hasta = relacion.hasta ? normalizeDate(relacion.hasta) : null;

    return desde <= ref && (hasta === null || hasta >= ref);
  });
}

export function filterRelacionesUnidadPorTipos<T extends UnidadRelacionLike>(relaciones: T[], tipos: string[]) {
  return relaciones.filter((relacion) => {
    const tipo = relacion.tipoRelacion ?? TIPO_RELACION_UNIDAD.RESPONSABLE;
    return tipos.includes(tipo);
  });
}

function resolveRelaciones<T extends UnidadRelacionLike>(
  relaciones: T[],
  predicate: (relacion: T) => boolean,
  refDate = new Date(),
) {
  const vigentes = relaciones.filter((relacion) => {
    const desde = normalizeDate(relacion.desde);
    const hasta = relacion.hasta ? normalizeDate(relacion.hasta) : null;
    const ref = normalizeDate(refDate);

    return predicate(relacion) && desde <= ref && (hasta === null || hasta >= ref);
  });

  if (vigentes.length > 0) {
    return vigentes;
  }

  return relaciones.filter(predicate);
}

export function getRelacionesDestinatariasBoleta<T extends UnidadRelacionLike>(relaciones: T[], refDate = new Date()) {
  return resolveRelaciones(
    relaciones,
    (relacion) =>
      normalizePorcentaje(relacion.porcentajeExpensasOrdinarias) > 0 ||
      normalizePorcentaje(relacion.porcentajeExpensasExtraordinarias) > 0,
    refDate,
  );
}

export function getRelacionesDestinatariasLiquidacion<T extends UnidadRelacionLike>(
  relaciones: T[],
  refDate = new Date(),
) {
  return resolveRelaciones(relaciones, (relacion) => {
    const tipo = relacion.tipoRelacion ?? TIPO_RELACION_UNIDAD.RESPONSABLE;

    if (tipo === TIPO_RELACION_UNIDAD.DUENO || tipo === TIPO_RELACION_UNIDAD.RESPONSABLE) {
      return true;
    }

    if (tipo === TIPO_RELACION_UNIDAD.INQUILINO) {
      return Boolean(relacion.recibeLiquidacion);
    }

    return false;
  }, refDate);
}

export function calculateUnidadRelacionPorcentajeTotals<T extends UnidadRelacionLike>(relaciones: T[]) {
  return relaciones.reduce(
    (acc, relacion) => ({
      ordinarias: acc.ordinarias + normalizePorcentaje(relacion.porcentajeExpensasOrdinarias),
      extraordinarias: acc.extraordinarias + normalizePorcentaje(relacion.porcentajeExpensasExtraordinarias),
    }),
    { ordinarias: 0, extraordinarias: 0 },
  );
}

export function areUnidadRelacionPorcentajeTotalsValid(totals: {
  ordinarias: number;
  extraordinarias: number;
}) {
  return (
    Math.abs(totals.ordinarias - 100) <= PORCENTAJE_EPSILON &&
    Math.abs(totals.extraordinarias - 100) <= PORCENTAJE_EPSILON
  );
}

export function buildUnidadPersonaNotificationDefaults(params: { hasActiveRelations: boolean }) {
  const porcentajeDefault = params.hasActiveRelations ? 0 : 100;

  return {
    porcentajeExpensasOrdinarias: porcentajeDefault,
    porcentajeExpensasExtraordinarias: porcentajeDefault,
    recibeLiquidacion: false,
  };
}
