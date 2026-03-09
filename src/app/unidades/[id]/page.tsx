import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";

import { prisma } from "../../../../lib/prisma";
import { requireConsorcioAccess, requireConsorcioRole } from "../../../lib/auth";
import { formatDateAR, isVigente, normalizeDate } from "../../../lib/relaciones";

export default async function UnidadDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { finalizar?: string; error?: string };
}) {
  const id = Number(params.id);
  const finalizarId = Number(searchParams?.finalizar);
  const error = searchParams?.error;

  const unidad = await prisma.unidad.findUnique({
    where: { id },
    include: {
      consorcio: true,
      personas: {
        include: {
          persona: true,
        },
      },
    },
  });

  if (!unidad) {
    return <div className="p-6">Unidad no encontrada</div>;
  }

  await requireConsorcioAccess(unidad.consorcioId);

  async function removePersona(formData: FormData) {
    "use server";

    const unidadId = Number(formData.get("unidadId"));
    const relacionId = Number(formData.get("relacionId"));

    const unidadActual = await prisma.unidad.findUnique({ where: { id: unidadId }, select: { consorcioId: true } });
    if (!unidadActual) {
      redirect("/consorcios");
    }

    await requireConsorcioRole(unidadActual.consorcioId, ["ADMIN", "OPERADOR"]);

    await prisma.unidadPersona.delete({
      where: { id: relacionId },
    });

    redirect(`/unidades/${unidadId}`);
  }

  async function finalizarRelacion(formData: FormData) {
    "use server";

    const unidadId = Number(formData.get("unidadId"));
    const relacionId = Number(formData.get("relacionId"));
    const hastaRaw = (formData.get("hasta")?.toString() ?? "").trim();

    const unidadActual = await prisma.unidad.findUnique({ where: { id: unidadId }, select: { consorcioId: true } });
    if (!unidadActual) {
      redirect("/consorcios");
    }

    await requireConsorcioRole(unidadActual.consorcioId, ["ADMIN", "OPERADOR"]);

    if (!hastaRaw) {
      redirect(`/unidades/${unidadId}?error=fin_requerido&finalizar=${relacionId}`);
    }

    const relacion = await prisma.unidadPersona.findUnique({
      where: { id: relacionId },
      select: { id: true, desde: true, hasta: true },
    });

    if (!relacion || relacion.hasta !== null) {
      redirect(`/unidades/${unidadId}?error=ya_finalizada`);
    }

    const hasta = new Date(hastaRaw);

    if (hasta < relacion.desde) {
      redirect(`/unidades/${unidadId}?error=fin_menor_desde&finalizar=${relacionId}`);
    }

    await prisma.unidadPersona.update({
      where: { id: relacionId },
      data: { hasta },
    });

    redirect(`/unidades/${unidadId}`);
  }

  async function deleteUnidad(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));

    const unidadActual = await prisma.unidad.findUnique({ where: { id }, select: { consorcioId: true } });
    if (!unidadActual) {
      redirect("/consorcios");
    }

    await requireConsorcioRole(unidadActual.consorcioId, ["ADMIN"]);

    await prisma.unidad.delete({
      where: { id },
    });

    redirect("/consorcios");
  }

  const today = normalizeDate(new Date());

  const relacionesOrdenadas = unidad.personas
    .slice()
    .sort((a, b) => {
      const aVigente = isVigente(a.desde, a.hasta, today);
      const bVigente = isVigente(b.desde, b.hasta, today);

      if (aVigente !== bVigente) {
        return aVigente ? -1 : 1;
      }

      return b.desde.getTime() - a.desde.getTime();
    });

  const errorMessage =
    error === "fin_requerido"
      ? "Tenes que indicar una fecha de fin."
      : error === "ya_finalizada"
        ? "La relacion ya estaba finalizada."
        : error === "fin_menor_desde"
          ? "La fecha de fin no puede ser anterior a la fecha de inicio."
          : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href={`/consorcios/${unidad.consorcioId}`} className="text-blue-600 hover:underline">
        Volver al consorcio
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Unidad {unidad.identificador}</h1>

      <Link
        href={`/unidades/${params.id}/editar`}
        className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Editar
      </Link>

      <form action={deleteUnidad} className="inline-block">
        <input type="hidden" name="id" value={unidad.id} />
        <button
          type="submit"
          className="ml-2 inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Eliminar
        </button>
      </form>

      <div className="mt-6 space-y-2 rounded-lg border border-slate-200 bg-white p-6">
        <p>
          <span className="font-medium">Consorcio:</span> {unidad.consorcio.nombre}
        </p>
        <p>
          <span className="font-medium">Identificador:</span> {unidad.identificador}
        </p>
        <p>
          <span className="font-medium">Tipo:</span> {unidad.tipo}
        </p>
        <p>
          <span className="font-medium">Piso:</span> {unidad.piso ?? "-"} / <span className="font-medium">Departamento:</span>{" "}
          {unidad.departamento ?? "-"}
        </p>
        <p>
          <span className="font-medium">Superficie:</span> {unidad.superficie ?? "-"}
        </p>
        <p>
          <span className="font-medium">Porcentaje expensas:</span> {unidad.porcentajeExpensas ?? "-"}
        </p>
      </div>

      <h2 className="mt-8 text-xl font-semibold">Personas</h2>

      {errorMessage ? (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <Link
        href={`/unidades/${params.id}/personas/nueva`}
        className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Agregar persona
      </Link>

      {relacionesOrdenadas.length === 0 ? (
        <p className="mt-2 text-slate-500">Esta unidad aun no tiene personas asociadas.</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-left text-sm text-slate-600">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Apellido</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Telefono</th>
                  <th className="px-4 py-3 font-medium">Desde</th>
                  <th className="px-4 py-3 font-medium">Hasta</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-800">
                {relacionesOrdenadas.map((rel) => {
                  const vigente = isVigente(rel.desde, rel.hasta, today);
                  const inactiva = !vigente;

                  return (
                    <Fragment key={rel.id}>
                      <tr className={`border-t border-slate-100 ${inactiva ? "bg-gray-50 text-gray-500" : ""}`}>
                        <td className="px-4 py-3">{rel.persona.nombre}</td>
                        <td className="px-4 py-3">{rel.persona.apellido}</td>
                        <td className="px-4 py-3">{rel.persona.email ?? "-"}</td>
                        <td className="px-4 py-3">{rel.persona.telefono ?? "-"}</td>
                        <td className="px-4 py-3">{formatDateAR(rel.desde)}</td>
                        <td className="px-4 py-3">{formatDateAR(rel.hasta)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <form action={removePersona}>
                              <input type="hidden" name="unidadId" value={unidad.id} />
                              <input type="hidden" name="relacionId" value={rel.id} />
                              <button type="submit" className="text-red-600 hover:underline">
                                Desasociar
                              </button>
                            </form>

                            {vigente ? (
                              <Link href={`/unidades/${unidad.id}?finalizar=${rel.id}`} className="text-slate-700 hover:underline">
                                Finalizar
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {vigente && finalizarId === rel.id ? (
                        <tr className="border-t border-slate-100 bg-slate-50/40">
                          <td className="px-4 py-3" colSpan={7}>
                            <form action={finalizarRelacion} className="flex items-center gap-3">
                              <input type="hidden" name="unidadId" value={unidad.id} />
                              <input type="hidden" name="relacionId" value={rel.id} />
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
                              <Link href={`/unidades/${unidad.id}`} className="text-slate-700 hover:underline">
                                Cancelar
                              </Link>
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
