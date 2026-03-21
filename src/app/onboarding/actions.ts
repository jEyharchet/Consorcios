"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { getAccessContext, requireAuth, requireConsorcioRole } from "../../lib/auth";
import { updateActiveConsorcio } from "../../lib/consorcio-activo";
import { ONBOARDING_PATH } from "../../lib/onboarding";
import { prisma } from "../../lib/prisma";
import { createUnidadPersonaWithSequenceRecovery } from "../../lib/relaciones";

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
  const access = await getAccessContext();

  if (access.user.role === "SUPER_ADMIN") {
    redirect("/");
  }

  if (access.allowedConsorcioIds.length > 0) {
    redirect("/");
  }

  return access.user;
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

  if (personaEmail) {
    const matchingPersona = await tx.persona.findFirst({
      where: {
        email: {
          equals: personaEmail,
          mode: "insensitive",
        },
      },
      orderBy: { id: "asc" },
      select: { id: true },
    });

    if (matchingPersona) {
      await tx.persona.update({
        where: { id: matchingPersona.id },
        data: {
          nombre: params.nombre,
          apellido: params.apellido,
          email: personaEmail,
          telefono: params.telefono,
        },
      });

      await tx.user.update({
        where: { id: params.userId },
        data: { personaId: matchingPersona.id },
      });

      return matchingPersona;
    }
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

export async function createPersonaForOnboarding(formData: FormData) {
  const user = await requireUserWithoutConsorcios();

  if (user.personaId) {
    redirect(buildOnboardingUrl({ tab: "join" }));
  }

  const nombre = cleanValue(formData, "nombre");
  const apellido = cleanValue(formData, "apellido");
  const email = cleanValue(formData, "email");
  const telefono = cleanValue(formData, "telefono");

  if (!nombre || !apellido) {
    redirect(buildOnboardingUrl({ error: "missing_persona_fields" }));
  }

  await prisma.$transaction(async (tx) => {
    await resolveOrCreatePersonaTx(tx, {
      userId: user.id,
      nombre,
      apellido,
      email: email || null,
      telefono: telefono || null,
    });
  });

  redirect(buildOnboardingUrl({ ok: "persona_ready", tab: "join" }));
}

export async function requestConsorcioAccess(formData: FormData) {
  const user = await requireUserWithoutConsorcios();
  const consorcioId = Number(formData.get("consorcioId"));
  const q = cleanValue(formData, "q");
  const mensaje = cleanValue(formData, "mensaje");

  if (!user.personaId) {
    redirect(buildOnboardingUrl({ error: "persona_required" }));
  }

  if (!Number.isInteger(consorcioId) || consorcioId <= 0) {
    redirect(buildOnboardingUrl({ tab: "join", q, error: "consorcio_invalido" }));
  }

  const access = await getAccessContext();

  const [consorcio, pendingRequest] = await Promise.all([
    prisma.consorcio.findUnique({ where: { id: consorcioId }, select: { id: true } }),
    prisma.solicitudAccesoConsorcio.findFirst({
      where: {
        personaId: user.personaId,
        consorcioId,
        estado: ESTADO_PENDIENTE,
      },
      select: { id: true },
    }),
  ]);

  if (!consorcio) {
    redirect(buildOnboardingUrl({ tab: "join", q, error: "consorcio_invalido" }));
  }

  if (access.allowedConsorcioIds.includes(consorcioId)) {
    redirect(buildOnboardingUrl({ tab: "join", q, error: "already_member" }));
  }

  if (pendingRequest) {
    redirect(buildOnboardingUrl({ tab: "join", q, error: "duplicate_pending" }));
  }

  try {
    await prisma.solicitudAccesoConsorcio.create({
      data: {
        userId: user.id,
        personaId: user.personaId,
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
  unidadId?: number | null;
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
          personaId: true,
          estado: true,
          user: {
            select: {
              id: true,
              personaId: true,
            },
          },
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
        select: { id: true, personaId: true },
      });

      if (!requester) {
        return { status: "user_not_found" as const };
      }

      const personaId = solicitud.personaId ?? requester.personaId ?? solicitud.user.personaId;
      if (!personaId) {
        return { status: "persona_not_found" as const };
      }

      if (params.estado === ESTADO_APROBADA) {
        if (!params.unidadId || !Number.isInteger(params.unidadId) || params.unidadId <= 0) {
          return { status: "unidad_required" as const };
        }

        const unidad = await tx.unidad.findUnique({
          where: { id: params.unidadId },
          select: { id: true, consorcioId: true },
        });

        if (!unidad || unidad.consorcioId !== solicitud.consorcioId) {
          return { status: "unidad_invalid" as const };
        }

        const now = new Date();
        const existingRelation = await tx.unidadPersona.findFirst({
          where: {
            unidadId: unidad.id,
            personaId,
            OR: [{ hasta: null }, { hasta: { gte: now } }],
          },
          select: { id: true },
        });

        if (!existingRelation) {
          await createUnidadPersonaWithSequenceRecovery(tx, {
            unidadId: unidad.id,
            personaId,
            desde: now,
            hasta: null,
          });
        }
      }

      const updated = await tx.solicitudAccesoConsorcio.updateMany({
        where: {
          id: solicitud.id,
          estado: ESTADO_PENDIENTE,
        },
        data: {
          personaId,
          unidadId: params.estado === ESTADO_APROBADA ? params.unidadId ?? null : null,
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

    if (result.status === "persona_not_found") {
      redirect(buildSolicitudesUrl(params.consorcioId, { error: "persona_not_found" }));
    }

    if (result.status === "unidad_required") {
      redirect(buildSolicitudesUrl(params.consorcioId, { error: "unidad_required" }));
    }

    if (result.status === "unidad_invalid") {
      redirect(buildSolicitudesUrl(params.consorcioId, { error: "unidad_invalid" }));
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
  const unidadIdValue = formData.get("unidadId");
  const unidadId = unidadIdValue === null ? null : Number(unidadIdValue);

  if (!Number.isInteger(requestId) || requestId <= 0 || !Number.isInteger(consorcioId) || consorcioId <= 0) {
    redirect("/");
  }

  await resolveSolicitud({ requestId, consorcioId, unidadId, estado: ESTADO_APROBADA });
}

export async function rejectAccessRequest(formData: FormData) {
  const requestId = Number(formData.get("requestId"));
  const consorcioId = Number(formData.get("consorcioId"));

  if (!Number.isInteger(requestId) || requestId <= 0 || !Number.isInteger(consorcioId) || consorcioId <= 0) {
    redirect("/");
  }

  await resolveSolicitud({ requestId, consorcioId, estado: ESTADO_RECHAZADA });
}
