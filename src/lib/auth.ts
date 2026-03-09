import { redirect } from "next/navigation";

import { auth } from "../../auth";
import { prisma } from "./prisma";
import { isConsorcioRole, type ConsorcioRole, type GlobalRole } from "./roles";

export type CurrentUser = {
  id: string;
  role: GlobalRole;
  activo: boolean;
  email: string | null;
  name: string | null;
};

export type AccessContext = {
  user: CurrentUser;
  isSuperAdmin: boolean;
  assignments: Array<{ consorcioId: number; role: ConsorcioRole }>;
  allowedConsorcioIds: number[];
};

export async function requireAuth(): Promise<CurrentUser> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, activo: true, email: true, name: true },
  });

  if (!user || !user.activo) {
    redirect("/login");
  }

  const role: GlobalRole = user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";

  return { ...user, role };
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

  if (user.role === "SUPER_ADMIN") {
    const all = await prisma.consorcio.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    });

    return {
      user,
      isSuperAdmin: true,
      consorcios: all,
      assignments: [] as Array<{ consorcioId: number; role: ConsorcioRole }>,
      allowedConsorcioIds: all.map((c) => c.id),
    };
  }

  const assignmentsRaw = await prisma.userConsorcio.findMany({
    where: { userId: user.id },
    include: {
      consorcio: {
        select: { id: true, nombre: true },
      },
    },
    orderBy: { consorcio: { nombre: "asc" } },
  });

  const assignments = assignmentsRaw.map((a) => ({
    consorcioId: a.consorcioId,
    role: isConsorcioRole(a.role) ? a.role : "LECTURA",
  }));

  return {
    user,
    isSuperAdmin: false,
    consorcios: assignmentsRaw.map((a) => a.consorcio),
    assignments,
    allowedConsorcioIds: assignments.map((a) => a.consorcioId),
  };
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
