import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";

import { prisma } from "../../../../lib/prisma";
import { actaValidationMessages, isFileProvided, saveActaFile } from "../../../lib/actas";
import { requireConsorcioAccess, requireConsorcioRole } from "../../../lib/auth";
import { formatDateAR, isVigente, normalizeDate } from "../../../lib/relaciones";

export default async function ConsorcioDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { finalizarAdmin?: string; error?: string };
}) {
  const id = Number(params.id);
  const access = await requireConsorcioAccess(id);
  const finalizarAdminId = Number(searchParams?.finalizarAdmin);
  const error = searchParams?.error;

  const consorcio = await prisma.consorcio.findUnique({
    where: { id },
    include: {
      unidades: true,
      administradores: {
        include: {
          persona: true,
        },
      },
    },
  });

  async function deleteConsorcio(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    await requireConsorcioRole(id, ["ADMIN"]);

    await prisma.consorcio.delete({
      where: { id },
    });

    redirect("/consorcios");
  }

  async function desasociarAdministrador(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    await requireConsorcioRole(consorcioId, ["ADMIN"]);
    const relacionId = Number(formData.get("relacionId"));

    await prisma.consorcioAdministrador.delete({
      where: { id: relacionId },
    });

    redirect(`/consorcios/${consorcioId}`);
  }

  async function finalizarAdministrador(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    await requireConsorcioRole(consorcioId, ["ADMIN"]);
    const relacionId = Number(formData.get("relacionId"));
    const hastaRaw = (formData.get("hasta")?.toString() ?? "").trim();
    const acta = formData.get("acta");

    const hasFile = isFileProvided(acta);
    if (!hastaRaw && !hasFile) {
      redirect(`/consorcios/${consorcioId}?error=fin_requerido&finalizarAdmin=${relacionId}`);
    }

    const relacion = await prisma.consorcioAdministrador.findUnique({
      where: { id: relacionId },
      select: { id: true, desde: true, hasta: true },
    });

    if (!relacion) {
      redirect(`/consorcios/${consorcioId}?error=relacion_no_encontrada`);
    }

    const data: {
      hasta?: Date;
      actaNombreOriginal?: string | null;
      actaMimeType?: string | null;
      actaPath?: string | null;
      actaSubidaAt?: Date | null;
    } = {};

    if (hastaRaw) {
      const today = normalizeDate(new Date());
      if (!isVigente(relacion.desde, relacion.hasta, today)) {
        redirect(`/consorcios/${consorcioId}?error=ya_finalizada`);
      }

      const hasta = new Date(hastaRaw);
      if (hasta < relacion.desde) {
        redirect(`/consorcios/${consorcioId}?error=fin_menor_desde&finalizarAdmin=${relacionId}`);
      }

      data.hasta = hasta;
    }

    if (hasFile) {
      const saveResult = await saveActaFile(acta);
      if (!saveResult.ok) {
        redirect(`/consorcios/${consorcioId}?error=${saveResult.code}&finalizarAdmin=${relacionId}`);
      }

      data.actaNombreOriginal = saveResult.data.actaNombreOriginal;
      data.actaMimeType = saveResult.data.actaMimeType;
      data.actaPath = saveResult.data.actaPath;
      data.actaSubidaAt = saveResult.data.actaSubidaAt;
    }

    await prisma.consorcioAdministrador.update({
      where: { id: relacionId },
      data,
    });

    redirect(`/consorcios/${consorcioId}`);
  }

  if (!consorcio) {
    return <div className="p-6">Consorcio no encontrado</div>;
  }

  const parseFloor = (piso: string | null): number => {
    if (!piso) return Number.POSITIVE_INFINITY;
    const parsed = Number(piso);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  };

  const unidadesOrdenadas = consorcio.unidades
    .slice()
    .sort((a, b) => {
      const pisoDiff = parseFloor(a.piso) - parseFloor(b.piso);
      if (pisoDiff !== 0) return pisoDiff;

      return (a.departamento ?? "").localeCompare(b.departamento ?? "");
    });

  const today = normalizeDate(new Date());
  const administradoresOrdenados = consorcio.administradores
    .slice()
    .sort((a, b) => {
      const aVigente = isVigente(a.desde, a.hasta, today);
      const bVigente = isVigente(b.desde, b.hasta, today);

      if (aVigente !== bVigente) {
        return aVigente ? -1 : 1;
      }

      return b.desde.getTime() - a.desde.getTime();
    });

  const assignmentRole = access.isSuperAdmin ? "ADMIN" : access.assignments.find((assignment) => assignment.consorcioId === id)?.role;
  const canManageRequests = access.isSuperAdmin || assignmentRole === "ADMIN";

  const errorMessage =
    error === "fin_requerido"
      ? "Tenes que indicar fecha de fin o adjuntar un acta."
      : error === "fin_menor_desde"
        ? "La fecha de fin no puede ser anterior a la fecha de inicio."
        : error === "ya_finalizada"
          ? "La relacion ya estaba finalizada."
          : error === "relacion_no_encontrada"
            ? "No se encontro la relacion de administrador."
            : error === "invalid_type"
              ? actaValidationMessages.invalid_type
              : error === "max_size"
                ? actaValidationMessages.max_size
                : error === "write_error"
                  ? actaValidationMessages.write_error
                  : null;

  return (
    <div className="space-y-4 p-6">
      <Link href="/consorcios" className="text-blue-600 hover:underline">
        Volver
      </Link>

      <h1 className="text-2xl font-semibold">{consorcio.nombre}</h1>

      <Link
        href={`/consorcios/${consorcio.id}/editar`}
        className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Editar
      </Link>

      <form action={deleteConsorcio}>
        <input type="hidden" name="id" value={consorcio.id} />
        <button
          type="submit"
          className="ml-2 inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Eliminar
        </button>
      </form>

      <div className="space-y-2">
        {consorcio.tituloLegal ? (
          <p>
            <span className="font-medium">Titulo legal:</span> {consorcio.tituloLegal}
          </p>
        ) : null}
        <p>
          <span className="font-medium">Direccion:</span> {consorcio.direccion}
        </p>
        <p>
          <span className="font-medium">Ciudad:</span> {consorcio.ciudad}
        </p>
        <p>
          <span className="font-medium">Provincia:</span> {consorcio.provincia}
        </p>
        <p>
          <span className="font-medium">Codigo Postal:</span> {consorcio.codigoPostal}
        </p>
        <p>
          <span className="font-medium">CUIT:</span> {consorcio.cuit}
        </p>
        <p>
          <span className="font-medium">Fecha de creacion:</span> {consorcio.fechaCreacion.toLocaleDateString()}
        </p>
        <p>
          <span className="font-medium">Cantidad de unidades:</span> {consorcio.unidades.length}
        </p>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Administradores</h2>
        <div className="flex items-center gap-3">
          {canManageRequests ? (
            <Link
              href={`/consorcios/${consorcio.id}/solicitudes`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Ver solicitudes de acceso
            </Link>
          ) : null}
          <Link
            href={`/consorcios/${consorcio.id}/administradores/nuevo`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Agregar administrador
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {administradoresOrdenados.length === 0 ? (
        <p className="mt-2 text-slate-500">Este consorcio aun no tiene administradores.</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-left text-sm text-slate-600">
                  <th className="px-4 py-3 font-medium">Persona</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Telefono</th>
                  <th className="px-4 py-3 font-medium">Desde</th>
                  <th className="px-4 py-3 font-medium">Hasta</th>
                  <th className="px-4 py-3 font-medium">Acta</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-800">
                {administradoresOrdenados.map((rel) => {
                  const vigente = isVigente(rel.desde, rel.hasta, today);
                  const inactiva = !vigente;

                  return (
                    <Fragment key={rel.id}>
                      <tr className={`border-t border-slate-100 ${inactiva ? "bg-gray-50 text-gray-500" : ""}`}>
                        <td className="px-4 py-3">
                          {rel.persona.apellido}, {rel.persona.nombre}
                        </td>
                        <td className="px-4 py-3">{rel.persona.email ?? "-"}</td>
                        <td className="px-4 py-3">{rel.persona.telefono ?? "-"}</td>
                        <td className="px-4 py-3">{formatDateAR(rel.desde)}</td>
                        <td className="px-4 py-3">{formatDateAR(rel.hasta)}</td>
                        <td className="px-4 py-3">
                          {rel.actaPath ? (
                            <a href={rel.actaPath} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              Ver acta
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <form action={desasociarAdministrador}>
                              <input type="hidden" name="consorcioId" value={consorcio.id} />
                              <input type="hidden" name="relacionId" value={rel.id} />
                              <button type="submit" className="text-red-600 hover:underline">
                                Desasociar
                              </button>
                            </form>

                            {vigente ? (
                              <Link
                                href={`/consorcios/${consorcio.id}?finalizarAdmin=${rel.id}`}
                                className="text-slate-700 hover:underline"
                              >
                                Finalizar
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {vigente && finalizarAdminId === rel.id ? (
                        <tr className="border-t border-slate-100 bg-slate-50/40">
                          <td className="px-4 py-3" colSpan={7}>
                            <form
                              action={finalizarAdministrador}
                              className="space-y-3"
                              encType="multipart/form-data"
                            >
                              <input type="hidden" name="consorcioId" value={consorcio.id} />
                              <input type="hidden" name="relacionId" value={rel.id} />

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="text-sm font-medium text-slate-700">Fecha fin</label>
                                  <input
                                    type="date"
                                    name="hasta"
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-sm font-medium text-slate-700">Acta de designacion</label>
                                  <input
                                    type="file"
                                    name="acta"
                                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  />
                                </div>
                              </div>

                              {rel.actaPath ? (
                                <p className="text-xs text-slate-600">
                                  Acta actual: <a href={rel.actaPath} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Ver acta</a>
                                </p>
                              ) : null}

                              <p className="text-xs text-slate-500">Formatos permitidos: PDF, JPG, PNG, WEBP. Maximo 10 MB.</p>

                              <div className="flex items-center gap-3">
                                <button
                                  type="submit"
                                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                                >
                                  Guardar cambios
                                </button>
                                <Link href={`/consorcios/${consorcio.id}`} className="text-slate-700 hover:underline">
                                  Cancelar
                                </Link>
                              </div>
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

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Unidades</h2>
        <Link
          href={`/consorcios/${consorcio.id}/unidades/nueva`}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nueva unidad
        </Link>
      </div>

      {unidadesOrdenadas.length === 0 ? (
        <p className="mt-2 text-slate-500">Este consorcio aun no tiene unidades.</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-sm text-slate-600">
                <th className="px-4 py-3 font-medium">Identificador</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Piso</th>
                <th className="px-4 py-3 font-medium">Departamento</th>
                <th className="px-4 py-3 font-medium">Superficie</th>
                <th className="px-4 py-3 font-medium">Porcentaje expensas</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800">
              {unidadesOrdenadas.map((unidad) => (
                <tr key={unidad.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link href={`/unidades/${unidad.id}`} className="text-blue-600 hover:underline">
                      {unidad.identificador}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{unidad.tipo}</td>
                  <td className="px-4 py-3 text-slate-700">{unidad.piso ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{unidad.departamento ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{unidad.superficie}</td>
                  <td className="px-4 py-3 text-slate-700">{unidad.porcentajeExpensas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}





