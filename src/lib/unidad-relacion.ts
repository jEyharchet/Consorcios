export const TIPO_RELACION_UNIDAD = {
  RESPONSABLE: "RESPONSABLE",
  DUENO: "DUENO",
  INQUILINO: "INQUILINO",
  INQUILINO_EXP: "INQUILINO_EXP",
} as const;

export type TipoRelacionUnidadValue = (typeof TIPO_RELACION_UNIDAD)[keyof typeof TIPO_RELACION_UNIDAD];

export const TIPO_RELACION_UNIDAD_OPTIONS: Array<{ value: TipoRelacionUnidadValue; label: string }> = [
  { value: TIPO_RELACION_UNIDAD.RESPONSABLE, label: "Responsable" },
  { value: TIPO_RELACION_UNIDAD.DUENO, label: "Dueño" },
  { value: TIPO_RELACION_UNIDAD.INQUILINO, label: "Inquilino" },
  { value: TIPO_RELACION_UNIDAD.INQUILINO_EXP, label: "Inquilino Exp." },
];

export function isTipoRelacionUnidadValue(value: string | null | undefined): value is TipoRelacionUnidadValue {
  return TIPO_RELACION_UNIDAD_OPTIONS.some((option) => option.value === value);
}

type UnidadRelacionLike = {
  desde: Date;
  hasta: Date | null;
  tipoRelacion?: string | null;
};

function normalizeDate(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function formatTipoRelacionUnidadLabel(tipoRelacion: string | null | undefined) {
  const option = TIPO_RELACION_UNIDAD_OPTIONS.find((item) => item.value === tipoRelacion);
  return option?.label ?? "Responsable";
}

export function getTiposRelacionParaNotificacionGeneral(): TipoRelacionUnidadValue[] {
  return [TIPO_RELACION_UNIDAD.RESPONSABLE, TIPO_RELACION_UNIDAD.DUENO];
}

export function getTiposRelacionParaBoletaPago(): TipoRelacionUnidadValue[] {
  return [
    TIPO_RELACION_UNIDAD.RESPONSABLE,
    TIPO_RELACION_UNIDAD.DUENO,
    TIPO_RELACION_UNIDAD.INQUILINO_EXP,
  ];
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
