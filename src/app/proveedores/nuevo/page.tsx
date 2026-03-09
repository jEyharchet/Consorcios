import Link from "next/link";
import { redirect } from "next/navigation";

import { canManageAnyConsorcio, getAccessContext } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

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

export default async function NuevoProveedorPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const access = await getAccessContext();
  const canManage = await canManageAnyConsorcio();

  if (!canManage) {
    redirect("/proveedores");
  }

  const managedConsorcioIds = access.isSuperAdmin
    ? null
    : access.assignments.filter((a) => a.role === "ADMIN" || a.role === "OPERADOR").map((a) => a.consorcioId);

  const consorcios = await prisma.consorcio.findMany({
    where: access.isSuperAdmin ? undefined : { id: { in: managedConsorcioIds ?? [] } },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  async function crearProveedor(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    const manageableConsorcioIds = access.isSuperAdmin
      ? (
          await prisma.consorcio.findMany({
            orderBy: { nombre: "asc" },
            select: { id: true },
          })
        ).map((c) => c.id)
      : access.assignments.filter((a) => a.role === "ADMIN" || a.role === "OPERADOR").map((a) => a.consorcioId);

    if (!access.isSuperAdmin && manageableConsorcioIds.length === 0) {
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
      redirect("/proveedores/nuevo?error=nombre_requerido");
    }

    if (!fechaInicioRaw) {
      redirect("/proveedores/nuevo?error=fecha_inicio_requerida");
    }

    const fechaInicio = new Date(fechaInicioRaw);
    const fechaBaja = fechaBajaRaw ? new Date(fechaBajaRaw) : null;

    if (fechaBaja && fechaBaja < fechaInicio) {
      redirect("/proveedores/nuevo?error=fecha_baja_menor");
    }

    const asociaciones: Array<{ consorcioId: number; desde: Date; hasta: Date | null }> = [];

    for (const consorcioId of manageableConsorcioIds) {
      const enabled = formData.get(`consorcio_${consorcioId}_enabled`);
      if (!enabled) {
        continue;
      }

      const desdeRaw = (formData.get(`consorcio_${consorcioId}_desde`)?.toString() ?? "").trim();
      const hastaRaw = (formData.get(`consorcio_${consorcioId}_hasta`)?.toString() ?? "").trim();

      if (!desdeRaw) {
        redirect("/proveedores/nuevo?error=asociacion_desde_requerido");
      }

      const desde = new Date(desdeRaw);
      const hasta = hastaRaw ? new Date(hastaRaw) : null;

      if (hasta && hasta < desde) {
        redirect("/proveedores/nuevo?error=asociacion_hasta_menor");
      }

      asociaciones.push({ consorcioId, desde, hasta });
    }

    await prisma.proveedor.create({
      data: {
        nombre,
        tipo,
        subtipo: subtipoRaw || null,
        telefono: telefonoRaw || null,
        email: emailRaw || null,
        fechaInicio,
        fechaBaja,
        activo: !fechaBaja,
        ...(asociaciones.length > 0
          ? {
              consorcios: {
                create: asociaciones,
              },
            }
          : {}),
      },
    });

    redirect("/proveedores");
  }

  const errorMessage =
    searchParams?.error === "nombre_requerido"
      ? "El nombre es obligatorio."
      : searchParams?.error === "fecha_inicio_requerida"
        ? "La fecha de inicio es obligatoria."
        : searchParams?.error === "fecha_baja_menor"
          ? "La fecha de baja no puede ser menor a la fecha de inicio."
          : searchParams?.error === "asociacion_desde_requerido"
            ? "Cada asociacion seleccionada debe tener fecha desde."
            : searchParams?.error === "asociacion_hasta_menor"
              ? "La fecha hasta no puede ser menor a la fecha desde en una asociacion."
              : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href="/proveedores" className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Nuevo proveedor</h1>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <form action={crearProveedor} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium text-slate-700">Nombre</label>
          <input id="nombre" name="nombre" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="tipo" className="text-sm font-medium text-slate-700">Tipo</label>
          <select id="tipo" name="tipo" required defaultValue={tiposProveedor[0]} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">
            {tiposProveedor.map((tipo) => (
              <option key={tipo} value={tipo}>{tipo}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="subtipo" className="text-sm font-medium text-slate-700">Subtipo</label>
          <input id="subtipo" name="subtipo" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="telefono" className="text-sm font-medium text-slate-700">Telefono</label>
          <input id="telefono" name="telefono" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
          <input id="email" name="email" type="email" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="fechaInicio" className="text-sm font-medium text-slate-700">Fecha inicio</label>
            <input id="fechaInicio" name="fechaInicio" type="date" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>

          <div className="space-y-1">
            <label htmlFor="fechaBaja" className="text-sm font-medium text-slate-700">Fecha baja</label>
            <input id="fechaBaja" name="fechaBaja" type="date" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>
        </div>

        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">Asociaciones a consorcios (opcional)</h2>
          <p className="text-xs text-slate-500">Puedes crear el proveedor sin asociaciones y agregarlas luego.</p>

          <div className="space-y-3">
            {consorcios.map((consorcio) => (
              <div key={consorcio.id} className="rounded-md border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" name={`consorcio_${consorcio.id}_enabled`} value="1" />
                  {consorcio.nombre}
                </label>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">Desde</label>
                    <input name={`consorcio_${consorcio.id}_desde`} type="date" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">Hasta</label>
                    <input name={`consorcio_${consorcio.id}_hasta`} type="date" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Guardar
        </button>
      </form>
    </main>
  );
}
