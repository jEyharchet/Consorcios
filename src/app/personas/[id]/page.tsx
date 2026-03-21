import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Fragment } from "react";

import { prisma } from "../../../../lib/prisma";
import { getAccessContext, requireConsorcioRole, requireSuperAdmin } from "../../../lib/auth";
import { formatDateAR, isVigente, normalizeDate } from "../../../lib/relaciones";

export default async function PersonaDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { finalizar?: string; error?: string; confirmDelete?: string; ok?: string };
}) {
  const id = Number(params.id);
  if (Number.isNaN(id) || id <= 0) {
    notFound();
  }

  const access = await getAccessContext();
  const finalizarId = Number(searchParams?.finalizar);
  const error = searchParams?.error;
  const ok = searchParams?.ok;
  const confirmDelete = searchParams?.confirmDelete === "1";

  const persona = await prisma.persona.findUnique({
    where: { id },
    include: {
      unidades: {
        select: {
          id: true,
          unidadId: true,
          personaId: true,
          desde: true,
          hasta: true,
          unidad: {
            include: { consorcio: true },
          },
        },
      },
    },
  });

  async function desasociar(formData: FormData) {
    "use server";

    const personaId = Number(formData.get("personaId"));
    const unidadPersonaId = Number(formData.get("unidadPersonaId"));

    const relacionActual = await prisma.unidadPersona.findUnique({
      where: { id: unidadPersonaId },
      include: { unidad: { select: { consorcioId: true } } },
    });

    if (!relacionActual) {
      redirect(`/personas/${personaId}`);
    }

    await requireConsorcioRole(relacionActual.unidad.consorcioId, ["ADMIN", "OPERADOR"]);

    await prisma.unidadPersona.delete({
      where: { id: unidadPersonaId },
    });

    redirect(`/personas/${personaId}`);
  }

  async function finalizarRelacion(formData: FormData) {
    "use server";

    const personaId = Number(formData.get("personaId"));
    const unidadPersonaId = Number(formData.get("unidadPersonaId"));
    const hastaRaw = (formData.get("hasta")?.toString() ?? "").trim();

    const relacionActual = await prisma.unidadPersona.findUnique({
      where: { id: unidadPersonaId },
      include: { unidad: { select: { consorcioId: true } } },
    });

    if (!relacionActual) {
      redirect(`/personas/${personaId}`);
    }

    await requireConsorcioRole(relacionActual.unidad.consorcioId, ["ADMIN", "OPERADOR"]);

    if (!hastaRaw) {
      redirect(`/personas/${personaId}?error=fin_requerido&finalizar=${unidadPersonaId}`);
    }

    const relacion = await prisma.unidadPersona.findUnique({
      where: { id: unidadPersonaId },
      select: { id: true, desde: true, hasta: true },
    });

    if (!relacion || relacion.hasta !== null) {
      redirect(`/personas/${personaId}?error=ya_finalizada`);
    }

    const hasta = new Date(hastaRaw);

    if (hasta < relacion.desde) {
      redirect(`/personas/${personaId}?error=fin_menor_desde&finalizar=${unidadPersonaId}`);
    }

    await prisma.unidadPersona.update({
      where: { id: unidadPersonaId },
      data: { hasta },
    });

    redirect(`/personas/${personaId}`);
  }

  async function deletePersona(formData: FormData) {
    "use server";

    await requireSuperAdmin();

    const personaId = Number(formData.get("id"));
    if (!Number.isInteger(personaId) || personaId <= 0) {
      redirect("/personas");
    }

    const today = normalizeDate(new Date());

    const [unidadVigenteCount, adminVigenteCount] = await Promise.all([
      prisma.unidadPersona.count({
        where: {
          personaId,
          OR: [{ hasta: null }, { hasta: { gte: today } }],
        },
      }),
      prisma.consorcioAdministrador.count({
        where: {
          personaId,
          OR: [{ hasta: null }, { hasta: { gte: today } }],
        },
      }),
    ]);

    if (unidadVigenteCount > 0 || adminVigenteCount > 0) {
      redirect(`/personas/${personaId}?error=delete_vigente`);
    }

    await prisma.persona.delete({ where: { id: personaId } });
    redirect("/personas");
  }

  if (!persona) {
    return <div className="p-6">Persona no encontrada</div>;
  }

  const relacionesVisibles = access.isSuperAdmin
    ? persona.unidades
    : persona.unidades.filter((rel) => access.allowedConsorcioIds.includes(rel.unidad.consorcioId));

  if (!access.isSuperAdmin && relacionesVisibles.length === 0) {
    return <div className="p-6">Persona no encontrada</div>;
  }

  const today = normalizeDate(new Date());
  const relacionesOrdenadas = relacionesVisibles
    .slice()
    .sort((a, b) => {
      const aVigente = isVigente(a.desde, a.hasta, today);
      const bVigente = isVigente(b.desde, b.hasta, today);

      if (aVigente !== bVigente) {
        return aVigente ? -1 : 1;
      }

      return b.desde.getTime() - a.desde.getTime();
    });

  const canEditPersona =
    access.isSuperAdmin ||
    relacionesVisibles.some((rel) =>
      access.assignments.some(
        (assignment) =>
          assignment.consorcioId === rel.unidad.consorcioId &&
          (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
      ),
    );

  const errorMessage =
    error === "fin_requerido"
      ? "Tenes que indicar una fecha de fin."
      : error === "ya_finalizada"
        ? "La relacion ya estaba finalizada."
        : error === "fin_menor_desde"
          ? "La fecha de fin no puede ser anterior a la fecha de inicio."
          : error === "delete_vigente"
            ? "No se puede eliminar la persona porque tiene relaciones vigentes."
            : null;

  const okMessage = ok === "updated" ? "Los datos de la persona se guardaron correctamente." : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Link href="/personas" className="text-blue-600 hover:underline">
            Volver
          </Link>
          <h1 className="text-2xl font-semibold">
            {persona.apellido}, {persona.nombre}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {canEditPersona ? (
            <Link
              href={`/personas/${persona.id}/editar`}
              className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Editar
            </Link>
          ) : null}

          <Link
            href={`/personas/${persona.id}/asociar`}
            className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Asociar a unidad
          </Link>

          {access.isSuperAdmin ? (
            <>
              {!confirmDelete ? (
                <Link
                  href={`/personas/${persona.id}?confirmDelete=1`}
                  className="inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Eliminar
                </Link>
              ) : (
                <form action={deletePersona}>
                  <input type="hidden" name="id" value={persona.id} />
                  <button
                    type="submit"
                    className="inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Confirmar eliminacion
                  </button>
                </form>
              )}
            </>
          ) : null}
        </div>
      </header>

      {access.isSuperAdmin && confirmDelete ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Confirma la eliminacion. Esta accion no se puede deshacer.
          <Link href={`/personas/${persona.id}`} className="ml-3 text-blue-600 hover:underline">
            Cancelar
          </Link>
        </div>
      ) : null}

      {okMessage ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {okMessage}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <p>
          <span className="font-medium">Email:</span> {persona.email ?? "-"}
        </p>
        <p>
          <span className="font-medium">Telefono:</span> {persona.telefono ?? "-"}
        </p>
      </div>

      <h2 className="mt-8 text-xl font-semibold">Relaciones</h2>

      {errorMessage ? (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-4 py-3 font-medium">Consorcio</th>
              <th className="px-4 py-3 font-medium">Unidad</th>
              <th className="px-4 py-3 font-medium">Desde</th>
              <th className="px-4 py-3 font-medium">Hasta</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-800">
            {relacionesOrdenadas.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td colSpan={5} className="px-4 py-4 text-slate-500">
                  Sin relaciones cargadas.
                </td>
              </tr>
            ) : (
              relacionesOrdenadas.map((relacion) => {
                const vigente = isVigente(relacion.desde, relacion.hasta, today);
                const inactiva = !vigente;

                return (
                  <Fragment key={relacion.id}>
                    <tr className={`border-t border-slate-100 ${inactiva ? "bg-gray-50 text-gray-500" : ""}`}>
                      <td className="px-4 py-3">{relacion.unidad.consorcio.nombre}</td>
                      <td className="px-4 py-3">
                        {relacion.unidad.identificador} ({relacion.unidad.tipo})
                      </td>
                      <td className="px-4 py-3">{formatDateAR(relacion.desde)}</td>
                      <td className="px-4 py-3">{formatDateAR(relacion.hasta)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <form action={desasociar}>
                            <input type="hidden" name="personaId" value={persona.id} />
                            <input type="hidden" name="unidadPersonaId" value={relacion.id} />
                            <button type="submit" className="text-red-600 hover:underline">
                              Desasociar
                            </button>
                          </form>

                          {vigente ? (
                            <Link href={`/personas/${persona.id}?finalizar=${relacion.id}`} className="text-slate-700 hover:underline">
                              Finalizar
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {vigente && finalizarId === relacion.id ? (
                      <tr className="border-t border-slate-100 bg-slate-50/40">
                        <td className="px-4 py-3" colSpan={5}>
                          <form action={finalizarRelacion} className="flex items-center gap-3">
                            <input type="hidden" name="personaId" value={persona.id} />
                            <input type="hidden" name="unidadPersonaId" value={relacion.id} />
                            <input
                              type="date"
                              name="hasta"
                              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                            />
                            <button
                              type="submit"
                              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                            >
                              Guardar fin
                            </button>
                            <Link href={`/personas/${persona.id}`} className="text-slate-700 hover:underline">
                              Cancelar
                            </Link>
                          </form>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
