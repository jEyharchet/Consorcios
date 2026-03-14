import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../../../lib/prisma";
import { requireConsorcioRole } from "../../../../../lib/auth";
import { validateNoOverlap } from "../../../../../lib/relaciones";

async function createPersonaWithSequenceRecovery(data: {
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
}) {
  try {
    return await prisma.persona.create({ data });
  } catch (error) {
    const target = error instanceof Prisma.PrismaClientKnownRequestError
      ? (error.meta as { target?: unknown } | undefined)?.target
      : undefined;
    const targetIncludesId =
      (Array.isArray(target) && target.includes("id")) ||
      (typeof target === "string" && target.includes("id"));
    const isDuplicatedId =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      targetIncludesId;

    if (!isDuplicatedId) {
      throw error;
    }

    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"Persona"', 'id'),
        COALESCE((SELECT MAX(id) FROM "Persona"), 1),
        true
      );
    `);

    return prisma.persona.create({ data });
  }
}

export default async function NuevaPersonaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { q?: string; error?: string };
}) {
  const unidadId = Number(params.id);
  const unidadBase = await prisma.unidad.findUnique({ where: { id: unidadId }, select: { consorcioId: true } });

  if (!unidadBase) {
    return <div className="p-6">Unidad no encontrada</div>;
  }

  if (!unidadBase) {
    redirect("/unidades");
  }
  
  await requireConsorcioRole(unidadBase.consorcioId, ["ADMIN", "OPERADOR"]);

  const q = searchParams?.q?.trim() ?? "";
  const error = searchParams?.error;

  const asociados = await prisma.unidadPersona.findMany({
    where: { unidadId },
    select: { personaId: true },
  });

  const personaIdsYaAsociadas = asociados.map((a) => a.personaId);

  const personas =
    q.length < 2
      ? []
      : await prisma.persona.findMany({
          where: {
            AND: [
              ...(personaIdsYaAsociadas.length ? [{ id: { notIn: personaIdsYaAsociadas } }] : []),
              {
                OR: [{ apellido: { contains: q } }, { nombre: { contains: q } }],
              },
            ],
          },
          orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
          take: 20,
        });

  async function addPersonaExistente(formData: FormData) {
    "use server";

    const personaId = Number(formData.get("personaId"));
    const desdeRaw = (formData.get("desde")?.toString() ?? "").trim();
    const hastaRaw = (formData.get("hasta")?.toString() ?? "").trim();
    const q = (formData.get("q")?.toString() ?? "").trim();

    if (!unidadBase) {
      redirect("/unidades");
    }

    await requireConsorcioRole(unidadBase.consorcioId, ["ADMIN", "OPERADOR"]);

    const qs = new URLSearchParams();
    if (q) qs.set("q", q);

    if (!desdeRaw) {
      qs.set("error", "desde_requerido");
      redirect(`/unidades/${unidadId}/personas/nueva?${qs.toString()}`);
    }

    const desde = new Date(desdeRaw);
    const hasta = hastaRaw ? new Date(hastaRaw) : null;

    if (hasta && hasta < desde) {
      qs.set("error", "fin_menor_desde");
      redirect(`/unidades/${unidadId}/personas/nueva?${qs.toString()}`);
    }

    const existentes = await prisma.unidadPersona.findMany({
      where: { unidadId, personaId },
      select: { desde: true, hasta: true },
    });

    const validacion = validateNoOverlap(existentes, { desde, hasta });

    if (!validacion.ok) {
      qs.set("error", "solape");
      redirect(`/unidades/${unidadId}/personas/nueva?${qs.toString()}`);
    }

    await prisma.unidadPersona.create({
      data: { unidadId, personaId, desde, hasta },
    });

    redirect(`/unidades/${unidadId}`);
  }

  async function createPersona(formData: FormData) {
    "use server";

    if (!unidadBase) {
      redirect("/unidades");
    }

    await requireConsorcioRole(unidadBase.consorcioId, ["ADMIN", "OPERADOR"]);

    const nombre = (formData.get("nombre")?.toString() ?? "").trim();
    const apellido = (formData.get("apellido")?.toString() ?? "").trim();
    const emailRaw = (formData.get("email")?.toString() ?? "").trim();
    const telefonoRaw = (formData.get("telefono")?.toString() ?? "").trim();
    const desdeRaw = (formData.get("desde")?.toString() ?? "").trim();
    const hastaRaw = (formData.get("hasta")?.toString() ?? "").trim();
    const q = (formData.get("q")?.toString() ?? "").trim();

    const qs = new URLSearchParams();
    if (q) qs.set("q", q);

    if (!desdeRaw) {
      qs.set("error", "desde_requerido");
      redirect(`/unidades/${unidadId}/personas/nueva?${qs.toString()}`);
    }

    const desde = new Date(desdeRaw);
    const hasta = hastaRaw ? new Date(hastaRaw) : null;

    if (hasta && hasta < desde) {
      qs.set("error", "fin_menor_desde");
      redirect(`/unidades/${unidadId}/personas/nueva?${qs.toString()}`);
    }

    const persona = await createPersonaWithSequenceRecovery({
      nombre,
      apellido,
      email: emailRaw || null,
      telefono: telefonoRaw || null,
    });

    const existentes = await prisma.unidadPersona.findMany({
      where: { unidadId, personaId: persona.id },
      select: { desde: true, hasta: true },
    });

    const validacion = validateNoOverlap(existentes, { desde, hasta });

    if (!validacion.ok) {
      qs.set("error", "solape");
      redirect(`/unidades/${unidadId}/personas/nueva?${qs.toString()}`);
    }

    await prisma.unidadPersona.create({
      data: {
        unidadId,
        personaId: persona.id,
        desde,
        hasta,
      },
    });

    redirect(`/unidades/${unidadId}`);
  }

  const errorMessage =
    error === "desde_requerido"
      ? "Tenes que indicar una fecha de inicio."
      : error === "fin_menor_desde"
        ? "La fecha de fin no puede ser anterior a la fecha de inicio."
        : error === "solape"
          ? "Ya existe una relacion para esa persona y unidad que se superpone con el rango de fechas."
          : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/unidades/${unidadId}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Nueva persona</h1>
      </header>

      {errorMessage ? (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <form method="GET" className="mb-4 flex gap-2">
          <input
            name="q"
            defaultValue={searchParams?.q ?? ""}
            placeholder="Buscar por apellido y/o nombre..."
            className="w-full rounded-md border px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Buscar
          </button>
        </form>

        <h2 className="mb-2 text-lg font-semibold">Seleccionar persona existente</h2>

        {q.length < 2 ? (
          <p className="text-sm text-slate-500">Escribi al menos 2 letras para buscar personas.</p>
        ) : personas.length === 0 ? (
          <p className="text-sm text-slate-500">No se encontraron personas.</p>
        ) : (
          <div className="space-y-3">
            {personas.map((persona) => (
              <form key={persona.id} action={addPersonaExistente} className="rounded-md border border-slate-200 p-3">
                <input type="hidden" name="personaId" value={persona.id} />
                <input type="hidden" name="q" value={q} />

                <div className="mb-3 text-sm text-slate-800">
                  <p className="font-medium">
                    {persona.apellido}, {persona.nombre}
                  </p>
                  <p className="text-slate-600">
                    {persona.email ?? "Sin email"} | {persona.telefono ?? "Sin telefono"}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor={`desde-${persona.id}`} className="text-sm font-medium text-slate-700">
                      Desde
                    </label>
                    <input
                      id={`desde-${persona.id}`}
                      name="desde"
                      type="date"
                      required
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={`hasta-${persona.id}`} className="text-sm font-medium text-slate-700">
                      Hasta
                    </label>
                    <input
                      id={`hasta-${persona.id}`}
                      name="hasta"
                      type="date"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Agregar a esta unidad
                </button>
              </form>
            ))}
          </div>
        )}
      </section>

      <form action={createPersona} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <input type="hidden" name="q" value={q} />

        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="apellido" className="text-sm font-medium text-slate-700">
            Apellido
          </label>
          <input
            id="apellido"
            name="apellido"
            required
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
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="desdeNueva" className="text-sm font-medium text-slate-700">
              Desde
            </label>
            <input
              id="desdeNueva"
              name="desde"
              type="date"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="hastaNueva" className="text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input
              id="hastaNueva"
              name="hasta"
              type="date"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Guardar
        </button>
      </form>
    </main>
  );
}
