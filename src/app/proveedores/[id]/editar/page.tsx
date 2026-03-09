import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "../../../../../lib/prisma";
import { getAccessContext } from "../../../../lib/auth";

const tiposProveedor = [
  "Sueldos y Cargas Sociales",
  "Servicios Publicos",
  "Abonos",
  "Mantenimiento General",
  "Gastos Bancarios",
  "Gastos de Limpieza",
  "Gastos de Administracion",
  "Seguros",
  "Otros",
] as const;

export default async function EditarProveedorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const id = Number(params.id);

  const proveedor = await prisma.proveedor.findUnique({
    where: { id },
    include: {
      consorcios: {
        include: { consorcio: { select: { id: true, nombre: true } } },
      },
    },
  });

  if (!proveedor) {
    return <div className="p-6">Proveedor no encontrado</div>;
  }

  const access = await getAccessContext();

  const manageableConsorcioIds = access.isSuperAdmin
    ? null
    : access.assignments.filter((a) => a.role === "ADMIN" || a.role === "OPERADOR").map((a) => a.consorcioId);

  if (!access.isSuperAdmin && (manageableConsorcioIds?.length ?? 0) === 0) {
    redirect("/proveedores");
  }

  const canEdit =
    access.isSuperAdmin ||
    proveedor.consorcios.some((rel) => (manageableConsorcioIds ?? []).includes(rel.consorcioId));

  if (!canEdit) {
    redirect("/proveedores");
  }

  const consorciosEditables = await prisma.consorcio.findMany({
    where: access.isSuperAdmin ? undefined : { id: { in: manageableConsorcioIds ?? [] } },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  const asociacionPorConsorcio = new Map(proveedor.consorcios.map((rel) => [rel.consorcioId, rel]));

  async function actualizarProveedor(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));

    const proveedorActual = await prisma.proveedor.findUnique({
      where: { id },
      include: { consorcios: true },
    });

    if (!proveedorActual) {
      redirect("/proveedores");
    }

    const access = await getAccessContext();
    const manageableConsorcioIds = access.isSuperAdmin
      ? (
          await prisma.consorcio.findMany({
            orderBy: { nombre: "asc" },
            select: { id: true },
          })
        ).map((c) => c.id)
      : access.assignments.filter((a) => a.role === "ADMIN" || a.role === "OPERADOR").map((a) => a.consorcioId);

    const canEdit =
      access.isSuperAdmin ||
      proveedorActual.consorcios.some((rel) => manageableConsorcioIds.includes(rel.consorcioId));

    if (!canEdit) {
      redirect("/proveedores");
    }

    const nombre = (formData.get("nombre")?.toString() ?? "").trim();
    const tipo = (formData.get("tipo")?.toString() ?? "").trim();
    const subtipoRaw = (formData.get("subtipo")?.toString() ?? "").trim();
    const telefonoRaw = (formData.get("telefono")?.toString() ?? "").trim();
    const emailRaw = (formData.get("email")?.toString() ?? "").trim();
    const fechaInicioRaw = (formData.get("fechaInicio")?.toString() ?? "").trim();
    const fechaBajaRaw = (formData.get("fechaBaja")?.toString() ?? "").trim();

    if (!nombre) {
      redirect(`/proveedores/${id}/editar?error=nombre_requerido`);
    }

    if (!fechaInicioRaw) {
      redirect(`/proveedores/${id}/editar?error=fecha_inicio_requerida`);
    }

    const fechaInicio = new Date(fechaInicioRaw);
    const fechaBaja = fechaBajaRaw ? new Date(fechaBajaRaw) : null;

    if (fechaBaja && fechaBaja < fechaInicio) {
      redirect(`/proveedores/${id}/editar?error=fecha_baja_menor`);
    }

    const selectedAsociaciones: Array<{ consorcioId: number; desde: Date; hasta: Date | null }> = [];

    for (const consorcioId of manageableConsorcioIds) {
      const enabled = formData.get(`consorcio_${consorcioId}_enabled`);
      if (!enabled) {
        continue;
      }

      const desdeRaw = (formData.get(`consorcio_${consorcioId}_desde`)?.toString() ?? "").trim();
      const hastaRaw = (formData.get(`consorcio_${consorcioId}_hasta`)?.toString() ?? "").trim();

      if (!desdeRaw) {
        redirect(`/proveedores/${id}/editar?error=asociacion_desde_requerido`);
      }

      const desde = new Date(desdeRaw);
      const hasta = hastaRaw ? new Date(hastaRaw) : null;

      if (hasta && hasta < desde) {
        redirect(`/proveedores/${id}/editar?error=asociacion_hasta_menor`);
      }

      selectedAsociaciones.push({ consorcioId, desde, hasta });
    }

    const asociacionesNoEditables = proveedorActual.consorcios.filter(
      (rel) => !manageableConsorcioIds.includes(rel.consorcioId)
    );

    if (selectedAsociaciones.length === 0 && asociacionesNoEditables.length === 0) {
      redirect(`/proveedores/${id}/editar?error=asociacion_requerida`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.proveedor.update({
        where: { id },
        data: {
          nombre,
          tipo,
          subtipo: subtipoRaw || null,
          telefono: telefonoRaw || null,
          email: emailRaw || null,
          fechaInicio,
          fechaBaja,
          activo: !fechaBaja,
        },
      });

      await tx.proveedorConsorcio.deleteMany({
        where: {
          proveedorId: id,
          consorcioId: {
            in: manageableConsorcioIds,
            notIn: selectedAsociaciones.map((a) => a.consorcioId),
          },
        },
      });

      for (const asociacion of selectedAsociaciones) {
        await tx.proveedorConsorcio.upsert({
          where: {
            proveedorId_consorcioId: {
              proveedorId: id,
              consorcioId: asociacion.consorcioId,
            },
          },
          update: {
            desde: asociacion.desde,
            hasta: asociacion.hasta,
          },
          create: {
            proveedorId: id,
            consorcioId: asociacion.consorcioId,
            desde: asociacion.desde,
            hasta: asociacion.hasta,
          },
        });
      }
    });

    redirect(`/proveedores/${id}`);
  }

  const errorMessage =
    searchParams?.error === "nombre_requerido"
      ? "El nombre es obligatorio."
      : searchParams?.error === "fecha_inicio_requerida"
        ? "La fecha de inicio es obligatoria."
        : searchParams?.error === "fecha_baja_menor"
          ? "La fecha de baja no puede ser menor a la fecha de inicio."
          : searchParams?.error === "asociacion_requerida"
            ? "Debe existir al menos una asociacion a consorcio."
            : searchParams?.error === "asociacion_desde_requerido"
              ? "Cada asociacion seleccionada debe tener fecha desde."
              : searchParams?.error === "asociacion_hasta_menor"
                ? "La fecha hasta no puede ser menor a la fecha desde en una asociacion."
                : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/proveedores/${proveedor.id}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Editar proveedor</h1>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <form action={actualizarProveedor} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <input type="hidden" name="id" value={proveedor.id} />

        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium text-slate-700">Nombre</label>
          <input id="nombre" name="nombre" required defaultValue={proveedor.nombre} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="tipo" className="text-sm font-medium text-slate-700">Tipo</label>
          <select id="tipo" name="tipo" required defaultValue={proveedor.tipo} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">
            {tiposProveedor.map((tipo) => (
              <option key={tipo} value={tipo}>{tipo}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="subtipo" className="text-sm font-medium text-slate-700">Subtipo</label>
          <input id="subtipo" name="subtipo" defaultValue={proveedor.subtipo ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="telefono" className="text-sm font-medium text-slate-700">Telefono</label>
          <input id="telefono" name="telefono" defaultValue={proveedor.telefono ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
          <input id="email" name="email" type="email" defaultValue={proveedor.email ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="fechaInicio" className="text-sm font-medium text-slate-700">Fecha inicio</label>
            <input id="fechaInicio" name="fechaInicio" type="date" required defaultValue={proveedor.fechaInicio.toISOString().slice(0, 10)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>
          <div className="space-y-1">
            <label htmlFor="fechaBaja" className="text-sm font-medium text-slate-700">Fecha baja</label>
            <input id="fechaBaja" name="fechaBaja" type="date" defaultValue={proveedor.fechaBaja ? proveedor.fechaBaja.toISOString().slice(0, 10) : ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>
        </div>

        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">Asociaciones editables</h2>
          <p className="text-xs text-slate-500">Puedes modificar solo los consorcios donde tienes permisos de administracion.</p>

          <div className="space-y-3">
            {consorciosEditables.map((consorcio) => {
              const rel = asociacionPorConsorcio.get(consorcio.id);

              return (
                <div key={consorcio.id} className="rounded-md border border-slate-200 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      name={`consorcio_${consorcio.id}_enabled`}
                      value="1"
                      defaultChecked={Boolean(rel)}
                    />
                    {consorcio.nombre}
                  </label>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Desde</label>
                      <input
                        name={`consorcio_${consorcio.id}_desde`}
                        type="date"
                        defaultValue={rel ? rel.desde.toISOString().slice(0, 10) : ""}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Hasta</label>
                      <input
                        name={`consorcio_${consorcio.id}_hasta`}
                        type="date"
                        defaultValue={rel?.hasta ? rel.hasta.toISOString().slice(0, 10) : ""}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Guardar</button>
      </form>
    </main>
  );
}
