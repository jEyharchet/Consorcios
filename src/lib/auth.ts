import { redirect } from "next/navigation";

import { auth } from "../../auth";
import { ensureUserPersona } from "./persona-identity";
import { prisma } from "./prisma";
import { isConsorcioRole, type ConsorcioRole, type GlobalRole } from "./roles";

export type CurrentUser = {
  id: string;
  role: GlobalRole;
  activo: boolean;
  email: string | null;
  name: string | null;
  personaId: number | null;
};

export type AccessContext = {
  user: CurrentUser;
  isSuperAdmin: boolean;
  assignments: Array<{ consorcioId: number; role: ConsorcioRole }>;
  allowedConsorcioIds: number[];
};

type UserRecord = {
  id: string;
  role: string;
  activo: boolean;
  email: string | null;
  name: string | null;
  personaId: number | null;
};

const ROLE_RANK: Record<ConsorcioRole, number> = {
  LECTURA: 1,
  OPERADOR: 2,
  ADMIN: 3,
};

async function getCurrentUserRecord(userId: string): Promise<CurrentUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, activo: true, email: true, name: true, personaId: true },
  });

  if (!user || !user.activo) {
    return null;
  }

  const personaId = await ensureUserPersona(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      createIfMissing: false,
    },
    prisma,
  );
  const role: GlobalRole = user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";

  return {
    ...user,
    role,
    personaId,
  };
}

export async function getCurrentUserFromSession(): Promise<CurrentUser | null> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  return getCurrentUserRecord(userId);
}

async function buildAccessContextForUser(user: CurrentUser): Promise<AccessContext & { consorcios: Array<{ id: number; nombre: string }> }> {
  if (user.role === "SUPER_ADMIN") {
    const all = await prisma.consorcio.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    });

    return {
      user,
      isSuperAdmin: true,
      consorcios: all,
      assignments: [],
      allowedConsorcioIds: all.map((c) => c.id),
    };
  }

  const consorcioRoleMap = new Map<number, { nombre: string; role: ConsorcioRole }>();
  const now = new Date();

  const mergeAssignment = (consorcioId: number, nombre: string, role: ConsorcioRole) => {
    const current = consorcioRoleMap.get(consorcioId);
    if (!current || ROLE_RANK[role] > ROLE_RANK[current.role]) {
      consorcioRoleMap.set(consorcioId, { nombre, role });
    }
  };

  if (user.personaId) {
    const [adminRelations, unidadRelations] = await Promise.all([
      prisma.consorcioAdministrador.findMany({
        where: {
          personaId: user.personaId,
          desde: { lte: now },
          OR: [{ hasta: null }, { hasta: { gte: now } }],
        },
        select: {
          consorcio: {
            select: { id: true, nombre: true },
          },
        },
      }),
      prisma.unidadPersona.findMany({
        where: {
          personaId: user.personaId,
          desde: { lte: now },
          OR: [{ hasta: null }, { hasta: { gte: now } }],
        },
        select: {
          unidad: {
            select: {
              consorcio: {
                select: { id: true, nombre: true },
              },
            },
          },
        },
      }),
    ]);

    for (const relation of adminRelations) {
      mergeAssignment(relation.consorcio.id, relation.consorcio.nombre, "ADMIN");
    }

    for (const relation of unidadRelations) {
      mergeAssignment(relation.unidad.consorcio.id, relation.unidad.consorcio.nombre, "LECTURA");
    }
  }

  const legacyAssignments = await prisma.userConsorcio.findMany({
    where: { userId: user.id },
    include: {
      consorcio: {
        select: { id: true, nombre: true },
      },
    },
    orderBy: { consorcio: { nombre: "asc" } },
  });

  for (const assignment of legacyAssignments) {
    mergeAssignment(
      assignment.consorcioId,
      assignment.consorcio.nombre,
      isConsorcioRole(assignment.role) ? assignment.role : "LECTURA"
    );
  }

  const assignments = Array.from(consorcioRoleMap.entries())
    .map(([consorcioId, value]) => ({ consorcioId, role: value.role, nombre: value.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    user,
    isSuperAdmin: false,
    consorcios: assignments.map((assignment) => ({ id: assignment.consorcioId, nombre: assignment.nombre })),
    assignments: assignments.map(({ consorcioId, role }) => ({ consorcioId, role })),
    allowedConsorcioIds: assignments.map((assignment) => assignment.consorcioId),
  };
}

export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUserFromSession();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireSuperAdmin() {
  const user = await requireAuth();

  if (user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return user;
}

export async function getAccessibleConsorcios() {
  const user = await requireAuth();
  return buildAccessContextForUser(user);
}

export async function getAccessContext(): Promise<AccessContext> {
  const access = await getAccessibleConsorcios();

  return {
    user: access.user,
    isSuperAdmin: access.isSuperAdmin,
    assignments: access.assignments,
    allowedConsorcioIds: access.allowedConsorcioIds,
  };
}

export async function getAccessContextForUserId(userId: string): Promise<AccessContext | null> {
  const user = await getCurrentUserRecord(userId);
  if (!user) {
    return null;
  }

  const access = await buildAccessContextForUser(user);
  return {
    user: access.user,
    isSuperAdmin: access.isSuperAdmin,
    assignments: access.assignments,
    allowedConsorcioIds: access.allowedConsorcioIds,
  };
}

export async function hasConsorcioAccessForUserId(userId: string, consorcioId: number) {
  const access = await getAccessContextForUserId(userId);

  if (!access) {
    return false;
  }

  return access.isSuperAdmin || access.allowedConsorcioIds.includes(consorcioId);
}

export async function hasConsorcioRoleForUserId(userId: string, consorcioId: number, roles: ConsorcioRole[]) {
  const access = await getAccessContextForUserId(userId);

  if (!access) {
    return false;
  }

  if (access.isSuperAdmin) {
    return true;
  }

  const assignment = access.assignments.find((item) => item.consorcioId === consorcioId);
  return Boolean(assignment && roles.includes(assignment.role));
}

export async function canManageAnyConsorcio() {
  const access = await getAccessContext();

  if (access.isSuperAdmin) {
    return true;
  }

  return access.assignments.some((assignment) => assignment.role === "ADMIN" || assignment.role === "OPERADOR");
}

export async function requireConsorcioAccess(consorcioId: number) {
  if (!Number.isInteger(consorcioId) || consorcioId <= 0) {
    redirect("/");
  }

  const access = await getAccessContext();

  if (!access.isSuperAdmin && !access.allowedConsorcioIds.includes(consorcioId)) {
    redirect("/");
  }

  return access;
}

export async function requireConsorcioRole(consorcioId: number, roles: ConsorcioRole[]) {
  if (!Number.isInteger(consorcioId) || consorcioId <= 0) {
    redirect("/");
  }

  const access = await getAccessContext();

  if (access.isSuperAdmin) {
    return access;
  }

  const assignment = access.assignments.find((a) => a.consorcioId === consorcioId);

  if (!assignment || !roles.includes(assignment.role)) {
    redirect("/");
  }

  return access;
}

export function hasNoConsorcios(access: AccessContext) {
  return !access.isSuperAdmin && access.allowedConsorcioIds.length === 0;
}
