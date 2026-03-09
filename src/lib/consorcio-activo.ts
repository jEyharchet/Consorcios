import { cookies } from "next/headers";

import { getAccessContext } from "./auth";
import { prisma } from "./prisma";

export const ACTIVE_CONSORCIO_COOKIE = "consorcio_activo";

export type ConsorcioOption = {
  id: number;
  nombre: string;
};

function parseConsorcioId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function resolveActiveConsorcioId(
  requestedId: number | null,
  allowedIds: number[]
): number | null {
  if (allowedIds.length === 0) {
    return null;
  }

  if (requestedId && allowedIds.includes(requestedId)) {
    return requestedId;
  }

  if (allowedIds.length === 1) {
    return allowedIds[0];
  }

  return allowedIds[0];
}

export async function getAccessibleConsorciosForUser(): Promise<{
  access: Awaited<ReturnType<typeof getAccessContext>>;
  consorcios: ConsorcioOption[];
}> {
  const access = await getAccessContext();

  const consorcios = await prisma.consorcio.findMany({
    where: access.isSuperAdmin ? undefined : { id: { in: access.allowedConsorcioIds } },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  return { access, consorcios };
}

export async function getActiveConsorcioContext() {
  const { access, consorcios } = await getAccessibleConsorciosForUser();

  const cookieStore = cookies();
  const cookieValue = cookieStore.get(ACTIVE_CONSORCIO_COOKIE)?.value;
  const cookieId = parseConsorcioId(cookieValue);

  const allowedIds = consorcios.map((c) => c.id);
  const activeConsorcioId = resolveActiveConsorcioId(cookieId, allowedIds);

  const shouldPersist = String(activeConsorcioId ?? "") !== String(cookieId ?? "");

  return {
    access,
    consorcios,
    activeConsorcioId,
    shouldPersist,
  };
}

export async function updateActiveConsorcio(consorcioId: number | null) {
  const { consorcios } = await getAccessibleConsorciosForUser();
  const allowedIds = consorcios.map((c) => c.id);

  const resolved = resolveActiveConsorcioId(consorcioId, allowedIds);
  const cookieStore = cookies();

  if (resolved) {
    cookieStore.set(ACTIVE_CONSORCIO_COOKIE, String(resolved), {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    cookieStore.delete(ACTIVE_CONSORCIO_COOKIE);
  }

  return resolved;
}
