import type { PrismaClient } from "@prisma/client";

import { prisma } from "./prisma";

export const COCHERAS_MODOS = ["TODAS", "SOLO_COCHERAS"] as const;
export const VOTO_TIPOS = ["PERSONA", "UNIDAD"] as const;
export const VOTO_MULTIPLES_DUENO_MODOS = ["INDIVIDUAL", "UNIFICADO"] as const;
export const VOTO_MULTIPLES_UNIDAD_MODOS = ["UNO", "MULTIPLES"] as const;
export const VOTO_PESO_MODOS = ["IGUAL", "PORCENTUAL"] as const;
export const PLAZO_TIPOS = ["APERTURA", "ENVIO_ACTA"] as const;
export const VOTO_DEFAULT_OPCIONES = ["POSITIVO", "NEGATIVO", "ABSTENCION"] as const;

type ConsorcioConfigClient = {
  consorcio: PrismaClient["consorcio"];
  consorcioConfiguracion: PrismaClient["consorcioConfiguracion"];
};

export type CocherasModo = (typeof COCHERAS_MODOS)[number];
export type VotoTipo = (typeof VOTO_TIPOS)[number];
export type VotoMultiplesDuenoModo = (typeof VOTO_MULTIPLES_DUENO_MODOS)[number];
export type VotoMultiplesUnidadModo = (typeof VOTO_MULTIPLES_UNIDAD_MODOS)[number];
export type VotoPesoModo = (typeof VOTO_PESO_MODOS)[number];
export type PlazoTipo = (typeof PLAZO_TIPOS)[number];
export type VotoDefaultOpcion = (typeof VOTO_DEFAULT_OPCIONES)[number];

export const DEFAULT_CONSORCIO_CONFIG = {
  cocherasModo: "TODAS",
  votoTipo: "PERSONA",
  votoMultiplesDueno: "INDIVIDUAL",
  votoMultiplesUnidad: "MULTIPLES",
  votoPeso: "IGUAL",
  plazoTipo: "ENVIO_ACTA",
  plazoDias: 15,
  votoDefault: "POSITIVO",
  enviarCopiaAdmin: true,
} as const;

function isOneOf<T extends readonly string[]>(value: string, values: T): value is T[number] {
  return values.includes(value as T[number]);
}

export function parseBooleanCheckbox(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

export function parsePositiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function validateConsorcioConfiguracionInput(input: {
  cocherasModo: string;
  votoTipo: string;
  votoMultiplesDueno: string;
  votoMultiplesUnidad: string;
  votoPeso: string;
  plazoTipo: string;
  plazoDias: number;
  votoDefault: string;
  enviarCopiaAdmin: boolean;
}) {
  if (!isOneOf(input.cocherasModo, COCHERAS_MODOS)) {
    return { ok: false as const, error: "cocheras_modo_invalido" };
  }

  if (!isOneOf(input.votoTipo, VOTO_TIPOS)) {
    return { ok: false as const, error: "voto_tipo_invalido" };
  }

  if (!isOneOf(input.votoMultiplesDueno, VOTO_MULTIPLES_DUENO_MODOS)) {
    return { ok: false as const, error: "voto_multiples_dueno_invalido" };
  }

  if (!isOneOf(input.votoMultiplesUnidad, VOTO_MULTIPLES_UNIDAD_MODOS)) {
    return { ok: false as const, error: "voto_multiples_unidad_invalido" };
  }

  if (!isOneOf(input.votoPeso, VOTO_PESO_MODOS)) {
    return { ok: false as const, error: "voto_peso_invalido" };
  }

  if (!isOneOf(input.plazoTipo, PLAZO_TIPOS)) {
    return { ok: false as const, error: "plazo_tipo_invalido" };
  }

  if (!Number.isInteger(input.plazoDias) || input.plazoDias <= 0 || input.plazoDias > 365) {
    return { ok: false as const, error: "plazo_dias_invalido" };
  }

  if (!isOneOf(input.votoDefault, VOTO_DEFAULT_OPCIONES)) {
    return { ok: false as const, error: "voto_default_invalido" };
  }

  return {
    ok: true as const,
    value: input,
  };
}

export function buildDefaultConsorcioConfiguracionData(consorcioId: number) {
  return {
    consorcioId,
    ...DEFAULT_CONSORCIO_CONFIG,
  };
}

export async function ensureConsorcioConfiguracion(
  consorcioId: number,
  db: ConsorcioConfigClient = prisma,
) {
  return db.consorcioConfiguracion.upsert({
    where: { consorcioId },
    update: {},
    create: buildDefaultConsorcioConfiguracionData(consorcioId),
  });
}

export async function getConfiguracionConsorcio(
  consorcioId: number,
  db: ConsorcioConfigClient = prisma,
) {
  const existing = await db.consorcioConfiguracion.findUnique({
    where: { consorcioId },
  });

  if (existing) {
    return existing;
  }

  const consorcio = await db.consorcio.findUnique({
    where: { id: consorcioId },
    select: { id: true },
  });

  if (!consorcio) {
    throw new Error(`No se encontro el consorcio ${consorcioId} al resolver su configuracion.`);
  }

  return ensureConsorcioConfiguracion(consorcioId, db);
}
