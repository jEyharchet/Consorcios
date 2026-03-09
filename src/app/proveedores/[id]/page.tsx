import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "../../../../lib/prisma";
import { getAccessContext, requireSuperAdmin } from "../../../lib/auth";
import { formatDateAR, isVigente, normalizeDate } from "../../../lib/relaciones";

export default async function ProveedorDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; confirmDelete?: string };
}) {
  const id = Number(params.id);

  const proveedor = await prisma.proveedor.findUnique({
    where: { id },
    include: {
      consorcios: {
        include: {
          consorcio: { select: { id: true, nombre: true } },
        },
        orderBy: { consorcio: { nombre: "asc" } },
      },
    },
  });

  if (!proveedor) {
    return <div className="p-6">Proveedor no encontrado</div>;
  }

  const access = await getAccessContext();
  const today = normalizeDate(new Date());
  const confirmDelete = searchParams?.confirmDelete === "1";

  async function deleteProveedor(formData: FormData) {
    "use server";

    await requireSuperAdmin();

    const proveedorId = Number(formData.get("id"));
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      redirect("/proveedores");
    }

    const relacionesVigentes = await prisma.proveedorConsorcio.count({
      where: {
        proveedorId,
        OR: [{ hasta: null }, { hasta: { gte: normalizeDate(new Date()) } }],
      },
    });

    if (relacionesVigentes > 0) {
      redirect(`/proveedores/${proveedorId}?error=delete_vigente`);
    }

    await prisma.proveedor.delete({ where: { id: proveedorId } });
    redirect("/proveedores");
  }

  if (!access.isSuperAdmin) {
    const hasAccess = proveedor.consorcios.some(
      (rel) => access.allowedConsorcioIds.includes(rel.consorcioId) && isVigente(rel.desde, rel.hasta, today)
    );

    if (!hasAccess) {
      redirect("/proveedores");
    }
  }

  const relacionesVisibles = access.isSuperAdmin
    ? proveedor.consorcios
    : proveedor.consorcios.filter((rel) => access.allowedConsorcioIds.includes(rel.consorcioId));

  const canEdit =
    access.isSuperAdmin ||
    relationsCanEdit(relacionesVisibles, access.assignments.map((a) => ({ consorcioId: a.consorcioId, role: a.role })), today);

  const errorMessage = searchParams?.error === "delete_vigente"
    ? "No se puede eliminar el proveedor porque tiene asociaciones vigentes."
    : null;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href="/proveedores" className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">{proveedor.nombre}</h1>
      </header>

      <div className="flex items-center gap-2">
        {canEdit ? (
          <Link
            href={`/proveedores/${proveedor.id}/editar`}
            className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Editar
          </Link>
        ) : null}

        {access.isSuperAdmin ? (
          <>
            {!confirmDelete ? (
              <Link
                href={`/proveedores/${proveedor.id}?confirmDelete=1`}
                className="inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Eliminar
              </Link>
            ) : (
              <form action={deleteProveedor}>
                <input type="hidden" name="id" value={proveedor.id} />
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

      {access.isSuperAdmin && confirmDelete ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Confirma la eliminacion. Esta accion no se puede deshacer.
          <Link href={`/proveedores/${proveedor.id}`} className="ml-3 text-blue-600 hover:underline">
            Cancelar
          </Link>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="mt-6 space-y-2 rounded-lg border border-slate-200 bg-white p-6">
        <p>
          <span className="font-medium">Nombre:</span> {proveedor.nombre}
        </p>
        <p>
          <span className="font-medium">Tipo:</span> {proveedor.tipo}
        </p>
        <p>
          <span className="font-medium">Subtipo:</span> {proveedor.subtipo ?? "-"}
        </p>
        <p>
          <span className="font-medium">Telefono:</span> {proveedor.telefono ?? "-"}
        </p>
        <p>
          <span className="font-medium">Email:</span> {proveedor.email ?? "-"}
        </p>
        <p>
          <span className="font-medium">Fecha inicio:</span> {formatDateAR(proveedor.fechaInicio)}
        </p>
        <p>
          <span className="font-medium">Fecha baja:</span> {formatDateAR(proveedor.fechaBaja)}
        </p>
        <p>
          <span className="font-medium">Evaluacion promedio:</span> {proveedor.evaluacionPromedio ?? "-"}
        </p>
      </div>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Consorcios asociados</h2>
        {relacionesVisibles.length === 0 ? (
          <p className="mt-2 text-slate-500">Sin asociaciones visibles.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-left text-sm text-slate-600">
                  <th className="px-3 py-2 font-medium">Consorcio</th>
                  <th className="px-3 py-2 font-medium">Desde</th>
                  <th className="px-3 py-2 font-medium">Hasta</th>
                </tr>
              </thead>
              <tbody>
                {relacionesVisibles.map((rel) => (
                  <tr key={rel.id} className="border-t border-slate-100 text-sm">
                    <td className="px-3 py-2">{rel.consorcio.nombre}</td>
                    <td className="px-3 py-2">{formatDateAR(rel.desde)}</td>
                    <td className="px-3 py-2">{formatDateAR(rel.hasta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Gastos asociados</h2>
        <p className="mt-2 text-slate-500">Seccion pendiente de implementacion.</p>
      </section>
    </main>
  );
}

function relationsCanEdit(
  relaciones: Array<{ consorcioId: number; desde: Date; hasta: Date | null }>,
  assignments: Array<{ consorcioId: number; role: string }>,
  today: Date
) {
  const editableIds = new Set(
    assignments.filter((a) => a.role === "ADMIN" || a.role === "OPERADOR").map((a) => a.consorcioId)
  );

  return relaciones.some((rel) => editableIds.has(rel.consorcioId) && isVigente(rel.desde, rel.hasta, today));
}
