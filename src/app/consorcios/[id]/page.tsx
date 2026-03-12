import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";

import { prisma } from "../../../../lib/prisma";
import { actaValidationMessages, isFileProvided, saveActaFile } from "../../../lib/actas";
import { requireConsorcioAccess, requireConsorcioRole } from "../../../lib/auth";
import { formatDateAR, isVigente, normalizeDate } from "../../../lib/relaciones";

function formatLocation(parts: Array<string | null | undefined>) {
  return parts.filter((part) => part && part.trim().length > 0).join(" • ");
}

function getAdminStatus(rel: { desde: Date; hasta: Date | null }, today: Date) {
  if (rel.desde > today) {
    return {
      label: "Futuro",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      rowClassName: "bg-amber-50/30",
    };
  }

  if (isVigente(rel.desde, rel.hasta, today)) {
    return {
      label: "Activo",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      rowClassName: "",
    };
  }

  return {
    label: "Finalizado",
    className: "border-slate-200 bg-slate-100 text-slate-600",
    rowClassName: "bg-gray-50 text-gray-500",
  };
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

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

  const [consorcio, pendingRequestsCount] = await Promise.all([
    prisma.consorcio.findUnique({
      where: { id },
      include: {
        unidades: true,
        administradores: {
          include: {
            persona: true,
          },
        },
      },
    }),
    prisma.solicitudAccesoConsorcio.count({
      where: {
        consorcioId: id,
        estado: "PENDIENTE",
      },
    }),
  ]);

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

    const relacion = await prisma.consorcioAdministrador.findUnique({
      where: { id: relacionId },
      select: { id: true, desde: true, hasta: true },
    });

    if (!relacion) {
      redirect(`/consorcios/${consorcioId}?error=relacion_no_encontrada`);
    }

    const today = normalizeDate(new Date());
    if (isVigente(relacion.desde, relacion.hasta, today)) {
      const otrosActivos = await prisma.consorcioAdministrador.count({
        where: {
          consorcioId,
          id: { not: relacionId },
          desde: { lte: today },
          OR: [{ hasta: null }, { hasta: { gte: today } }],
        },
      });

      if (otrosActivos === 0) {
        redirect(`/consorcios/${consorcioId}?error=ultimo_admin`);
      }
    }

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

      if (hasta <= today) {
        const otrosActivos = await prisma.consorcioAdministrador.count({
          where: {
            consorcioId,
            id: { not: relacionId },
            desde: { lte: today },
            OR: [{ hasta: null }, { hasta: { gte: today } }],
          },
        });

        if (otrosActivos === 0) {
          redirect(`/consorcios/${consorcioId}?error=ultimo_admin&finalizarAdmin=${relacionId}`);
        }
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

  const heroSubtitle = formatLocation([
    consorcio.direccion,
    consorcio.ciudad,
    consorcio.provincia,
    `${consorcio.unidades.length} ${consorcio.unidades.length === 1 ? "unidad" : "unidades"}`,
  ]);

  const errorMessage =
    error === "fin_requerido"
      ? "Tenes que indicar fecha de fin o adjuntar un acta."
      : error === "fin_menor_desde"
        ? "La fecha de fin no puede ser anterior a la fecha de inicio."
        : error === "ya_finalizada"
          ? "La relacion ya estaba finalizada."
          : error === "relacion_no_encontrada"
            ? "No se encontro la relacion de administrador."
            : error === "ultimo_admin"
              ? "El consorcio debe conservar al menos un administrador activo."
              : error === "invalid_type"
                ? actaValidationMessages.invalid_type
                : error === "max_size"
                  ? actaValidationMessages.max_size
                  : error === "write_error"
                    ? actaValidationMessages.write_error
                    : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <Link href="/consorcios" className="inline-flex text-sm font-medium text-blue-600 hover:underline">
        Volver a consorcios
      </Link>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Consorcio
              </span>
              {consorcio.tituloLegal ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {consorcio.tituloLegal}
                </span>
              ) : null}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{consorcio.nombre}</h1>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">{heroSubtitle}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unidades</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{consorcio.unidades.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Administradores</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{administradoresOrdenados.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Solicitudes</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{pendingRequestsCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Creado</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{consorcio.fechaCreacion.toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-sm flex-col gap-3 xl:items-stretch">
            <Link
              href={`/consorcios/${consorcio.id}/editar`}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Editar consorcio
            </Link>

            {canManageRequests ? (
              <Link
                href={`/consorcios/${consorcio.id}/solicitudes`}
                className="inline-flex items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <span>Ver solicitudes de integracion</span>
                <span className={`ml-3 inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${pendingRequestsCount > 0 ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {pendingRequestsCount}
                </span>
              </Link>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
              <Link
                href={`/consorcios/${consorcio.id}/administradores/nuevo`}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Agregar administrador
              </Link>

              <form action={deleteConsorcio} className="flex-1">
                <input type="hidden" name="id" value={consorcio.id} />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100"
                >
                  Eliminar consorcio
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          {errorMessage}
        </div>
      ) : null}

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Resumen del consorcio</h2>
              <p className="mt-1 text-sm text-slate-500">Datos generales y fiscales del edificio.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryItem label="Direccion" value={consorcio.direccion} />
            <SummaryItem label="Ciudad" value={consorcio.ciudad ?? "-"} />
            <SummaryItem label="Provincia" value={consorcio.provincia ?? "-"} />
            <SummaryItem label="Codigo postal" value={consorcio.codigoPostal ?? "-"} />
            <SummaryItem label="CUIT" value={consorcio.cuit ?? "-"} />
            <SummaryItem label="Fecha de creacion" value={consorcio.fechaCreacion.toLocaleDateString()} />
            <div className="sm:col-span-2">
              <SummaryItem label="Titulo legal" value={consorcio.tituloLegal ?? "-"} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Administradores</h2>
              <p className="mt-1 text-sm text-slate-500">Relacion historica y vigencia actual del consorcio.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
              {administradoresOrdenados.length}
            </span>
          </div>

          {administradoresOrdenados.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Este consorcio aun no tiene administradores.
            </p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full border-collapse">
                  <thead className="bg-slate-50/80">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Persona</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Contacto</th>
                      <th className="px-4 py-3">Desde</th>
                      <th className="px-4 py-3">Hasta</th>
                      <th className="px-4 py-3">Acta</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-slate-800">
                    {administradoresOrdenados.map((rel) => {
                      const status = getAdminStatus(rel, today);
                      const vigente = status.label === "Activo";

                      return (
                        <Fragment key={rel.id}>
                          <tr className={`border-t border-slate-100 align-top ${status.rowClassName}`}>
                            <td className="px-4 py-4">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {rel.persona.apellido}, {rel.persona.nombre}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                                {status.label}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              <div className="space-y-1">
                                <p>{rel.persona.email ?? "Sin email"}</p>
                                <p>{rel.persona.telefono ?? "Sin telefono"}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-700">{formatDateAR(rel.desde)}</td>
                            <td className="px-4 py-4 text-slate-700">{formatDateAR(rel.hasta)}</td>
                            <td className="px-4 py-4">
                              {rel.actaPath ? (
                                <a href={rel.actaPath} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                                  Ver acta
                                </a>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                                <form action={desasociarAdministrador}>
                                  <input type="hidden" name="consorcioId" value={consorcio.id} />
                                  <input type="hidden" name="relacionId" value={rel.id} />
                                  <button type="submit" className="font-medium text-red-600 hover:text-red-700 hover:underline">
                                    Desasociar
                                  </button>
                                </form>

                                {vigente ? (
                                  <Link
                                    href={`/consorcios/${consorcio.id}?finalizarAdmin=${rel.id}`}
                                    className="font-medium text-slate-700 hover:text-slate-900 hover:underline"
                                  >
                                    Finalizar
                                  </Link>
                                ) : null}
                              </div>
                            </td>
                          </tr>

                          {vigente && finalizarAdminId === rel.id ? (
                            <tr className="border-t border-slate-100 bg-slate-50/50">
                              <td className="px-4 py-4" colSpan={7}>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <form action={finalizarAdministrador} className="space-y-4" encType="multipart/form-data">
                                    <input type="hidden" name="consorcioId" value={consorcio.id} />
                                    <input type="hidden" name="relacionId" value={rel.id} />

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                      <div className="space-y-1">
                                        <label className="text-sm font-medium text-slate-700">Fecha fin</label>
                                        <input
                                          type="date"
                                          name="hasta"
                                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-sm font-medium text-slate-700">Acta de designacion</label>
                                        <input
                                          type="file"
                                          name="acta"
                                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                        />
                                      </div>
                                    </div>

                                    {rel.actaPath ? (
                                      <p className="text-xs text-slate-600">
                                        Acta actual:{" "}
                                        <a href={rel.actaPath} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                          Ver acta
                                        </a>
                                      </p>
                                    ) : null}

                                    <p className="text-xs text-slate-500">Formatos permitidos: PDF, JPG, PNG, WEBP. Maximo 10 MB.</p>

                                    <div className="flex items-center gap-3">
                                      <button
                                        type="submit"
                                        className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                                      >
                                        Guardar cambios
                                      </button>
                                      <Link href={`/consorcios/${consorcio.id}`} className="text-sm font-medium text-slate-700 hover:underline">
                                        Cancelar
                                      </Link>
                                    </div>
                                  </form>
                                </div>
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
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Unidades</h2>
            <p className="mt-1 text-sm text-slate-500">Vista general de las unidades cargadas para este consorcio.</p>
          </div>
          <Link
            href={`/consorcios/${consorcio.id}/unidades/nueva`}
            className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Nueva unidad
          </Link>
        </div>

        {unidadesOrdenadas.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Este consorcio aun no tiene unidades.
          </p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="bg-slate-50/80">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Identificador</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Piso</th>
                    <th className="px-4 py-3">Departamento</th>
                    <th className="px-4 py-3">Superficie</th>
                    <th className="px-4 py-3">Porcentaje expensas</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-800">
                  {unidadesOrdenadas.map((unidad) => (
                    <tr key={unidad.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-4">
                        <Link href={`/unidades/${unidad.id}`} className="font-medium text-blue-600 hover:underline">
                          {unidad.identificador}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{unidad.tipo}</td>
                      <td className="px-4 py-4 text-slate-700">{unidad.piso ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{unidad.departamento ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{unidad.superficie ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{unidad.porcentajeExpensas ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
