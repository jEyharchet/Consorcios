export const ADMIN_EMAIL_TIPO_ENVIO = {
  COMUNICACION_LIBRE: "COMUNICACION_LIBRE",
  ASAMBLEA_CONVOCATORIA: "ASAMBLEA_CONVOCATORIA",
  ASAMBLEA_SIMULACION_ADMIN: "ASAMBLEA_SIMULACION_ADMIN",
} as const;

export const ASAMBLEA_TIPO = {
  ORDINARIA: "ORDINARIA",
  EXTRAORDINARIA: "EXTRAORDINARIA",
} as const;

export const ASAMBLEA_ESTADO = {
  BORRADOR: "BORRADOR",
  CONVOCADA: "CONVOCADA",
  REALIZADA: "REALIZADA",
  CERRADA: "CERRADA",
} as const;

export const ASAMBLEA_VOTACION_ESTADO = {
  BORRADOR: "BORRADOR",
  ABIERTA: "ABIERTA",
  CERRADA: "CERRADA",
} as const;

export const ASAMBLEA_VOTO_VALOR = {
  POSITIVO: "POSITIVO",
  NEGATIVO: "NEGATIVO",
} as const;

export type AsambleaVotacionEstado = (typeof ASAMBLEA_VOTACION_ESTADO)[keyof typeof ASAMBLEA_VOTACION_ESTADO];
export type AsambleaVotoValor = (typeof ASAMBLEA_VOTO_VALOR)[keyof typeof ASAMBLEA_VOTO_VALOR];

const ASAMBLEA_VOTACION_ESTADOS = Object.values(ASAMBLEA_VOTACION_ESTADO) as AsambleaVotacionEstado[];
const ASAMBLEA_VOTO_VALORES = Object.values(ASAMBLEA_VOTO_VALOR) as AsambleaVotoValor[];

export function isAsambleaVotacionEstado(value: string): value is AsambleaVotacionEstado {
  return ASAMBLEA_VOTACION_ESTADOS.includes(value as AsambleaVotacionEstado);
}

export function isAsambleaVotoValor(value: string): value is AsambleaVotoValor {
  return ASAMBLEA_VOTO_VALORES.includes(value as AsambleaVotoValor);
}
