import { unstable_noStore as noStore } from "next/cache";

import { getAccessContext } from "./auth";
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

function getAdminConsorcioIdsFromAccess(assignments: Array<{ consorcioId: number; role: string }>) {
  return assignments.filter((assignment) => assignment.role === "ADMIN").map((assignment) => assignment.consorcioId);
}

export async function getDerivedNotifications() {
  noStore();

  const access = await getAccessContext();
  const adminConsorcioIds = access.isSuperAdmin ? [] : getAdminConsorcioIdsFromAccess(access.assignments);

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
