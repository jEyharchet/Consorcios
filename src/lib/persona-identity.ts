import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "./prisma";

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

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

export async function findPersonaByEmail(
  email: string | null | undefined,
  db: PrismaClientLike = prisma,
) {
  const normalizedEmail = normalizeEmailIdentity(email);

  if (!normalizedEmail) {
    return null;
  }

  return db.persona.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    orderBy: { id: "asc" },
    select: { id: true, nombre: true, apellido: true, email: true, telefono: true },
  });
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

  if (user.personaId) {
    return user.personaId;
  }

  const email = normalizeEmailIdentity(params.email ?? user.email);

  if (!email) {
    return null;
  }

  const linkedPersonaId = await linkUserToExistingPersonaByEmail(
    {
      userId: params.userId,
      email,
    },
    db,
  );

  if (linkedPersonaId) {
    return linkedPersonaId;
  }

  if (!params.createIfMissing) {
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
