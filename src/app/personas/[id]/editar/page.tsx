import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccessContext } from "@/lib/auth";
import { findPersonaByEmail, normalizeEmailIdentity } from "@/lib/persona-identity";
import { prisma } from "@/lib/prisma";

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const text = value?.toString().trim() ?? "";
  return text || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function EditarPersonaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    redirect("/personas");
  }

  const access = await getAccessContext();

  const persona = await prisma.persona.findUnique({
    where: { id },
    include: {
      unidades: {
        select: {
          unidad: {
            select: {
              consorcioId: true,
            },
          },
        },
      },
    },
  });

  if (!persona) {
    return <div className="p-6">Persona no encontrada</div>;
  }

  const consorcioIdsRelacionados = Array.from(new Set(persona.unidades.map((rel) => rel.unidad.consorcioId)));
  const canEdit =
    access.isSuperAdmin ||
    consorcioIdsRelacionados.some((consorcioId) =>
      access.assignments.some(
        (assignment) =>
          assignment.consorcioId === consorcioId &&
          (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
      ),
    );

  if (!canEdit) {
    redirect(`/personas/${id}`);
  }

  async function updatePersona(formData: FormData) {
    "use server";

    const personaId = Number(formData.get("id"));

    if (!Number.isInteger(personaId) || personaId <= 0) {
      redirect("/personas");
    }

    const access = await getAccessContext();
    const personaActual = await prisma.persona.findUnique({
      where: { id: personaId },
      include: {
        unidades: {
          select: {
            unidad: {
              select: {
                consorcioId: true,
              },
            },
          },
        },
      },
    });

    if (!personaActual) {
      redirect("/personas");
    }

    const consorcioIdsRelacionados = Array.from(new Set(personaActual.unidades.map((rel) => rel.unidad.consorcioId)));
    const canEdit =
      access.isSuperAdmin ||
      consorcioIdsRelacionados.some((consorcioId) =>
        access.assignments.some(
          (assignment) =>
            assignment.consorcioId === consorcioId &&
            (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
        ),
      );

    if (!canEdit) {
      redirect(`/personas/${personaId}`);
    }

    const nombre = (formData.get("nombre")?.toString() ?? "").trim();
    const apellido = (formData.get("apellido")?.toString() ?? "").trim();
    const emailRaw = normalizeOptionalText(formData.get("email"));
    const email = normalizeEmailIdentity(emailRaw);
    const telefono = normalizeOptionalText(formData.get("telefono"));

    if (!nombre) {
      redirect(`/personas/${personaId}/editar?error=nombre_requerido`);
    }

    if (!apellido) {
      redirect(`/personas/${personaId}/editar?error=apellido_requerido`);
    }

    if (email && !isValidEmail(email)) {
      redirect(`/personas/${personaId}/editar?error=email_invalido`);
    }

    if (email) {
      const existingPersona = await findPersonaByEmail(email, prisma);

      if (existingPersona && existingPersona.id !== personaId) {
        redirect(`/personas/${personaId}/editar?error=email_duplicado`);
      }
    }

    await prisma.persona.update({
      where: { id: personaId },
      data: {
        nombre,
        apellido,
        email,
        telefono,
      },
    });

    redirect(`/personas/${personaId}?ok=updated`);
  }

  const errorMessage =
    searchParams?.error === "nombre_requerido"
      ? "El nombre es obligatorio."
      : searchParams?.error === "apellido_requerido"
        ? "El apellido es obligatorio."
        : searchParams?.error === "email_invalido"
          ? "El email informado no es valido."
          : searchParams?.error === "email_duplicado"
            ? "Ya existe otra persona con ese email."
          : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/personas/${persona.id}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Editar persona</h1>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <form action={updatePersona} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <input type="hidden" name="id" value={persona.id} />

        <div className="space-y-1">
          <label htmlFor="apellido" className="text-sm font-medium text-slate-700">
            Apellido
          </label>
          <input
            id="apellido"
            name="apellido"
            required
            defaultValue={persona.apellido}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            defaultValue={persona.nombre}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={persona.email ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="telefono" className="text-sm font-medium text-slate-700">
            Telefono
          </label>
          <input
            id="telefono"
            name="telefono"
            defaultValue={persona.telefono ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Guardar
          </button>
          <Link href={`/personas/${persona.id}`} className="text-sm text-slate-700 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </main>
  );
}
