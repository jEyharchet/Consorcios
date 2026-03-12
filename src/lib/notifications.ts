import { unstable_noStore as noStore } from "next/cache";

import { requireAuth } from "./auth";
import { normalizeDate } from "./relaciones";
import { prisma } from "./prisma";

export type DerivedNotification = {
  id: string;
  type: "SOLICITUD_ACCESO";
  consorcioId: number;
  consorcioNombre: string;
  solicitudId: number;
  requestedAt: Date;
  requesterName: string | null;
  requesterEmail: string | null;
  href: string;
};

async function getAdminConsorcioIdsForCurrentUser() {
  const user = await requireAuth();

  if (user.role === "SUPER_ADMIN") {
    return [] as number[];
  }

  const today = normalizeDate(new Date());
  const consorcioIds = new Set<number>();

  if (user.personaId) {
    const adminRelations = await prisma.consorcioAdministrador.findMany({
      where: {
        personaId: user.personaId,
        desde: { lte: today },
        OR: [{ hasta: null }, { hasta: { gte: today } }],
      },
      select: {
        consorcioId: true,
      },
    });

    for (const relation of adminRelations) {
      consorcioIds.add(relation.consorcioId);
    }
  }

  const legacyAdminAssignments = await prisma.userConsorcio.findMany({
    where: {
      userId: user.id,
      role: "ADMIN",
    },
    select: {
      consorcioId: true,
    },
  });

  for (const assignment of legacyAdminAssignments) {
    consorcioIds.add(assignment.consorcioId);
  }

  return Array.from(consorcioIds);
}

export async function getDerivedNotifications() {
  noStore();

  const adminConsorcioIds = await getAdminConsorcioIdsForCurrentUser();

  if (adminConsorcioIds.length === 0) {
    return {
      pendingCount: 0,
      notifications: [] as DerivedNotification[],
    };
  }

  const pendingRequests = await prisma.solicitudAccesoConsorcio.findMany({
    where: {
      estado: "PENDIENTE",
      consorcioId: { in: adminConsorcioIds },
    },
    include: {
      consorcio: {
        select: {
          id: true,
          nombre: true,
        },
      },
      persona: {
        select: {
          nombre: true,
          apellido: true,
          email: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          persona: {
            select: {
              nombre: true,
              apellido: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const notifications = pendingRequests.map((request) => {
    const requesterPersona = request.persona ?? request.user.persona;
    const requesterName = requesterPersona
      ? `${requesterPersona.apellido}, ${requesterPersona.nombre}`
      : request.user.name ?? request.user.email ?? null;

    return {
      id: `solicitud-acceso-${request.id}`,
      type: "SOLICITUD_ACCESO" as const,
      consorcioId: request.consorcioId,
      consorcioNombre: request.consorcio.nombre,
      solicitudId: request.id,
      requestedAt: request.createdAt,
      requesterName,
      requesterEmail: request.persona?.email ?? request.user.email ?? null,
      href: `/consorcios/${request.consorcioId}/solicitudes`,
    };
  });

  return {
    pendingCount: notifications.length,
    notifications,
  };
}
