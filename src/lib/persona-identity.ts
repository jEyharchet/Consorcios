import type { Prisma, PrismaClient } from "@prisma/client";

import { normalizeDate } from "./relaciones";
import { prisma } from "./prisma";

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type PersonaEmailCandidate = {
  id: number;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  hasActiveAdminRelation: boolean;
  hasActiveUnidadRelation: boolean;
};

export function normalizeEmailIdentity(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function splitDisplayName(value: string | null | undefined) {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return { nombre: "", apellido: "" };
  }

  const parts = raw.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return { nombre: parts[0] ?? "", apellido: "" };
  }

  return {
    nombre: parts[0] ?? "",
    apellido: parts.slice(1).join(" "),
  };
}

function getPersonaCandidateScore(candidate: PersonaEmailCandidate) {
  return (candidate.hasActiveAdminRelation ? 10 : 0) + (candidate.hasActiveUnidadRelation ? 5 : 0);
}

function hasConsorcioRelations(candidate: PersonaEmailCandidate) {
  return candidate.hasActiveAdminRelation || candidate.hasActiveUnidadRelation;
}

async function findPersonaCandidatesByEmail(
  email: string | null | undefined,
  db: PrismaClientLike = prisma,
) {
  const normalizedEmail = normalizeEmailIdentity(email);

  if (!normalizedEmail) {
    return [];
  }

  const today = normalizeDate(new Date());
  const personas = await db.persona.findMany({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      email: true,
      telefono: true,
      consorciosAdministrados: {
        where: {
          desde: { lte: today },
          OR: [{ hasta: null }, { hasta: { gte: today } }],
        },
        select: { id: true },
        take: 1,
      },
      unidades: {
        where: {
          desde: { lte: today },
          OR: [{ hasta: null }, { hasta: { gte: today } }],
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  return personas
    .map((persona) => ({
      id: persona.id,
      nombre: persona.nombre,
      apellido: persona.apellido,
      email: persona.email,
      telefono: persona.telefono,
      hasActiveAdminRelation: persona.consorciosAdministrados.length > 0,
      hasActiveUnidadRelation: persona.unidades.length > 0,
    }))
    .sort((a, b) => {
      const scoreDiff = getPersonaCandidateScore(b) - getPersonaCandidateScore(a);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return a.id - b.id;
    });
}

async function getPersonaCandidateById(
  personaId: number,
  db: PrismaClientLike = prisma,
) {
  const today = normalizeDate(new Date());
  const persona = await db.persona.findUnique({
    where: { id: personaId },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      email: true,
      telefono: true,
      consorciosAdministrados: {
        where: {
          desde: { lte: today },
          OR: [{ hasta: null }, { hasta: { gte: today } }],
        },
        select: { id: true },
        take: 1,
      },
      unidades: {
        where: {
          desde: { lte: today },
          OR: [{ hasta: null }, { hasta: { gte: today } }],
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!persona) {
    return null;
  }

  return {
    id: persona.id,
    nombre: persona.nombre,
    apellido: persona.apellido,
    email: persona.email,
    telefono: persona.telefono,
    hasActiveAdminRelation: persona.consorciosAdministrados.length > 0,
    hasActiveUnidadRelation: persona.unidades.length > 0,
  };
}

export async function findPersonaByEmail(
  email: string | null | undefined,
  db: PrismaClientLike = prisma,
) {
  const [bestCandidate] = await findPersonaCandidatesByEmail(email, db);
  return bestCandidate ?? null;
}

export async function linkUserToExistingPersonaByEmail(
  params: {
    userId: string;
    email: string | null | undefined;
  },
  db: PrismaClientLike = prisma,
) {
  const persona = await findPersonaByEmail(params.email, db);

  if (!persona) {
    return null;
  }

  await db.user.update({
    where: { id: params.userId },
    data: { personaId: persona.id },
  });

  return persona.id;
}

export async function ensureUserPersona(
  params: {
    userId: string;
    email: string | null | undefined;
    name?: string | null | undefined;
    telefono?: string | null | undefined;
    createIfMissing?: boolean;
  },
  db: PrismaClientLike = prisma,
) {
  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      personaId: true,
      email: true,
    },
  });

  if (!user) {
    return null;
  }

  const email = normalizeEmailIdentity(params.email ?? user.email);
  const [bestPersonaByEmail, currentPersona] = await Promise.all([
    email ? findPersonaByEmail(email, db) : Promise.resolve(null),
    user.personaId ? getPersonaCandidateById(user.personaId, db) : Promise.resolve(null),
  ]);

  if (user.personaId) {
    if (
      bestPersonaByEmail &&
      bestPersonaByEmail.id !== user.personaId &&
      hasConsorcioRelations(bestPersonaByEmail) &&
      getPersonaCandidateScore(bestPersonaByEmail) > getPersonaCandidateScore(currentPersona ?? {
        id: user.personaId,
        nombre: "",
        apellido: "",
        email: null,
        telefono: null,
        hasActiveAdminRelation: false,
        hasActiveUnidadRelation: false,
      })
    ) {
      await db.user.update({
        where: { id: params.userId },
        data: { personaId: bestPersonaByEmail.id },
      });

      return bestPersonaByEmail.id;
    }

    return user.personaId;
  }

  if (bestPersonaByEmail) {
    await db.user.update({
      where: { id: params.userId },
      data: { personaId: bestPersonaByEmail.id },
    });

    return bestPersonaByEmail.id;
  }

  if (!params.createIfMissing || !email) {
    return null;
  }

  const { nombre, apellido } = splitDisplayName(params.name);

  if (!nombre || !apellido) {
    return null;
  }

  const persona = await db.persona.create({
    data: {
      nombre,
      apellido,
      email,
      telefono: params.telefono ?? null,
    },
    select: { id: true },
  });

  await db.user.update({
    where: { id: params.userId },
    data: { personaId: persona.id },
  });

  return persona.id;
}
