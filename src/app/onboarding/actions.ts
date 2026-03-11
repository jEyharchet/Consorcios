"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { requireAuth, requireConsorcioRole } from "../../lib/auth";
import { updateActiveConsorcio } from "../../lib/consorcio-activo";
import { ONBOARDING_PATH } from "../../lib/onboarding";
import { prisma } from "../../lib/prisma";

const ESTADO_PENDIENTE = "PENDIENTE";
const ESTADO_APROBADA = "APROBADA";
const ESTADO_RECHAZADA = "RECHAZADA";

function buildOnboardingUrl(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim().length > 0) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `${ONBOARDING_PATH}?${query}` : ONBOARDING_PATH;
}

function buildSolicitudesUrl(consorcioId: number, params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim().length > 0) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/consorcios/${consorcioId}/solicitudes?${query}` : `/consorcios/${consorcioId}/solicitudes`;
}

function cleanValue(formData: FormData, key: string) {
  return (formData.get(key)?.toString() ?? "").trim();
}

async function requireUserWithoutConsorcios() {
  const user = await requireAuth();

  if (user.role === "SUPER_ADMIN") {
    redirect("/");
  }

  const membershipCount = await prisma.userConsorcio.count({
    where: { userId: user.id },
  });

  if (membershipCount > 0) {
    redirect("/");
  }

  return user;
}

async function resolveOrCreatePersonaTx(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    nombre: string;
    apellido: string;
    email: string | null;
    telefono: string | null;
  }
) {
  const existingUser = await tx.user.findUnique({
    where: { id: params.userId },
    select: {
      personaId: true,
      email: true,
    },
  });

  if (!existingUser) {
    throw new Error("Usuario no encontrado al resolver persona.");
  }

  const personaEmail = params.email ?? existingUser.email ?? null;

  if (existingUser.personaId) {
    return tx.persona.update({
      where: { id: existingUser.personaId },
      data: {
        nombre: params.nombre,
        apellido: params.apellido,
        email: personaEmail,
        telefono: params.telefono,
      },
      select: { id: true },
    });
  }

  const persona = await tx.persona.create({
    data: {
      nombre: params.nombre,
      apellido: params.apellido,
      email: personaEmail,
      telefono: params.telefono,
    },
    select: { id: true },
  });

  await tx.user.update({
    where: { id: params.userId },
    data: { personaId: persona.id },
  });

  return persona;
}

export async function requestConsorcioAccess(formData: FormData) {
  const user = await requireUserWithoutConsorcios();
  const consorcioId = Number(formData.get("consorcioId"));
  const q = cleanValue(formData, "q");
  const mensaje = cleanValue(formData, "mensaje");

  if (!Number.isInteger(consorcioId) || consorcioId <= 0) {
    redirect(buildOnboardingUrl({ tab: "join", q, error: "consorcio_invalido" }));
  }

  const [consorcio, membership, pendingRequest] = await Promise.all([
    prisma.consorcio.findUnique({ where: { id: consorcioId }, select: { id: true } }),
    prisma.userConsorcio.findUnique({
      where: {
        userId_consorcioId: {
          userId: user.id,
          consorcioId,
        },
      },
      select: { id: true },
    }),
    prisma.solicitudAccesoConsorcio.findFirst({
      where: {
        userId: user.id,
        consorcioId,
        estado: ESTADO_PENDIENTE,
      },
      select: { id: true },
    }),
  ]);

  if (!consorcio) {
    redirect(buildOnboardingUrl({ tab: "join", q, error: "consorcio_invalido" }));
  }

  if (membership) {
    redirect(buildOnboardingUrl({ tab: "join", q, error: "already_member" }));
  }

  if (pendingRequest) {
    redirect(buildOnboardingUrl({ tab: "join", q, error: "duplicate_pending" }));
  }

  try {
    await prisma.solicitudAccesoConsorcio.create({
      data: {
        userId: user.id,
        consorcioId,
        estado: ESTADO_PENDIENTE,
        mensaje: mensaje || null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(buildOnboardingUrl({ tab: "join", q, error: "duplicate_pending" }));
    }

    throw error;
  }

  redirect(buildOnboardingUrl({ tab: "join", q, ok: "request_sent" }));
}

export async function createConsorcioFromOnboarding(formData: FormData) {
  const user = await requireUserWithoutConsorcios();

  const nombre = cleanValue(formData, "nombre");
  const apellido = cleanValue(formData, "apellido");
  const email = cleanValue(formData, "email");
  const telefono = cleanValue(formData, "telefono");
  const consorcioNombre = cleanValue(formData, "consorcioNombre");
  const tituloLegal = cleanValue(formData, "tituloLegal");
  const direccion = cleanValue(formData, "direccion");
  const ciudad = cleanValue(formData, "ciudad");
  const provincia = cleanValue(formData, "provincia");
  const codigoPostal = cleanValue(formData, "codigoPostal");
  const cuit = cleanValue(formData, "cuit");

  if (!nombre || !apellido || !consorcioNombre || !direccion) {
    redirect(buildOnboardingUrl({ tab: "create", error: "missing_fields" }));
  }

  const consorcio = await prisma.$transaction(async (tx) => {
    const persona = await resolveOrCreatePersonaTx(tx, {
      userId: user.id,
      nombre,
      apellido,
      email: email || null,
      telefono: telefono || null,
    });

    const now = new Date();

    return tx.consorcio.create({
      data: {
        nombre: consorcioNombre,
        tituloLegal: tituloLegal || null,
        direccion,
        ciudad: ciudad || null,
        provincia: provincia || null,
        codigoPostal: codigoPostal || null,
        cuit: cuit || null,
        fechaCreacion: now,
        userConsorcios: {
          create: {
            userId: user.id,
            role: "ADMIN",
          },
        },
        administradores: {
          create: {
            personaId: persona.id,
            desde: now,
          },
        },
      },
      select: { id: true },
    });
  });

  await updateActiveConsorcio(consorcio.id);
  redirect(`/consorcios/${consorcio.id}`);
}

async function resolveSolicitud(params: {
  requestId: number;
  consorcioId: number;
  estado: typeof ESTADO_APROBADA | typeof ESTADO_RECHAZADA;
}) {
  const actor = await requireAuth();
  await requireConsorcioRole(params.consorcioId, ["ADMIN"]);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudAccesoConsorcio.findUnique({
        where: { id: params.requestId },
        select: {
          id: true,
          consorcioId: true,
          userId: true,
          estado: true,
        },
      });

      if (!solicitud || solicitud.consorcioId !== params.consorcioId) {
        return { status: "not_found" as const };
      }

      if (solicitud.estado !== ESTADO_PENDIENTE) {
        return { status: "already_resolved" as const };
      }

      const requester = await tx.user.findUnique({
        where: { id: solicitud.userId },
        select: { id: true },
      });

      if (!requester) {
        return { status: "user_not_found" as const };
      }

      if (params.estado === ESTADO_APROBADA) {
        await tx.userConsorcio.upsert({
          where: {
            userId_consorcioId: {
              userId: solicitud.userId,
              consorcioId: solicitud.consorcioId,
            },
          },
          update: {},
          create: {
            userId: solicitud.userId,
            consorcioId: solicitud.consorcioId,
            role: "LECTURA",
          },
        });
      }

      const updated = await tx.solicitudAccesoConsorcio.updateMany({
        where: {
          id: solicitud.id,
          estado: ESTADO_PENDIENTE,
        },
        data: {
          estado: params.estado,
          resolvedAt: new Date(),
          resolvedByUserId: actor.id,
        },
      });

      if (updated.count === 0) {
        return { status: "already_resolved" as const };
      }

      return { status: "ok" as const };
    });

    if (result.status === "not_found") {
      redirect(buildSolicitudesUrl(params.consorcioId, { error: "not_found" }));
    }

    if (result.status === "already_resolved") {
      redirect(buildSolicitudesUrl(params.consorcioId, { error: "already_resolved" }));
    }

    if (result.status === "user_not_found") {
      redirect(buildSolicitudesUrl(params.consorcioId, { error: "user_not_found" }));
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003" || error.code === "P2025") {
        redirect(buildSolicitudesUrl(params.consorcioId, { error: "user_not_found" }));
      }
    }

    redirect(
      buildSolicitudesUrl(params.consorcioId, {
        error: params.estado === ESTADO_APROBADA ? "approval_failed" : "rejection_failed",
      })
    );
  }

  redirect(buildSolicitudesUrl(params.consorcioId, { ok: params.estado === ESTADO_APROBADA ? "approved" : "rejected" }));
}

export async function approveAccessRequest(formData: FormData) {
  const requestId = Number(formData.get("requestId"));
  const consorcioId = Number(formData.get("consorcioId"));

  if (!Number.isInteger(requestId) || requestId <= 0 || !Number.isInteger(consorcioId) || consorcioId <= 0) {
    redirect("/");
  }

  await resolveSolicitud({ requestId, consorcioId, estado: ESTADO_APROBADA });
}

export async function rejectAccessRequest(formData: FormData) {
  const requestId = Number(formData.get("requestId"));
  const consorcioId = Number(formData.get("consorcioId"));

  if (!Number.isInteger(requestId) || requestId <= 0 || !Number.isInteger(consorcioId) || consorcioId <= 0) {
    redirect("/");
  }

  await resolveSolicitud({ requestId, consorcioId, estado: ESTADO_RECHAZADA });
}
