import Link from "next/link";
import { redirect } from "next/navigation";

import { getActiveConsorcioContext } from "../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../lib/onboarding";
import { prisma } from "../../lib/prisma";
import { formatDateAR, isVigente, normalizeDate } from "../../lib/relaciones";

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams?: { consorcioId?: string };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();

  redirectToOnboardingIfNoConsorcios(access);

  const rawConsorcioIdParam = (searchParams?.consorcioId ?? "").trim();
  const consorcioIdParam = rawConsorcioIdParam || (activeConsorcioId ? String(activeConsorcioId) : "");
  const parsedSelectedConsorcioId = consorcioIdParam ? Number(consorcioIdParam) : null;
  const selectedConsorcioId =
    parsedSelectedConsorcioId && Number.isInteger(parsedSelectedConsorcioId) && parsedSelectedConsorcioId > 0
      ? parsedSelectedConsorcioId
      : null;

  if (!access.isSuperAdmin && selectedConsorcioId && !access.allowedConsorcioIds.includes(selectedConsorcioId)) {
    redirect("/proveedores");
  }

  const today = normalizeDate(new Date());
  const manageRoleByConsorcio = new Map(
    access.assignments
      .filter((a) => a.role === "ADMIN" || a.role === "OPERADOR")
      .map((a) => [a.consorcioId, a.role])
  );

  const canCreate = access.isSuperAdmin || manageRoleByConsorcio.size > 0;

  const consorcios = await prisma.consorcio.findMany({
    where: access.isSuperAdmin ? undefined : { id: { in: access.allowedConsorcioIds } },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  const proveedores = await prisma.proveedor.findMany({
    where: access.isSuperAdmin
      ? selectedConsorcioId
        ? {
            consorcios: {
              some: {
                consorcioId: selectedConsorcioId,
              },
            },
          }
        : undefined
      : {
          consorcios: {
            some: {
              consorcioId: selectedConsorcioId
                ? selectedConsorcioId
                : { in: access.allowedConsorcioIds },
              desde: { lte: today },
              OR: [{ hasta: null }, { hasta: { gte: today } }],
            },
          },
        },
    include: {
      consorcios: {
        include: {
          consorcio: { select: { id: true, nombre: true } },
        },
        orderBy: { consorcio: { nombre: "asc" } },
      },
    },
  });

  const proveedoresOrdenados = proveedores.slice().sort((a, b) => {
    const aActivo = a.fechaBaja === null;
    const bActivo = b.fechaBaja === null;

    if (aActivo !== bActivo) {
      return aActivo ? -1 : 1;
    }

    return a.nombre.localeCompare(b.nombre);
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        {canCreate ? (
          <Link
            href="/proveedores/nuevo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Nuevo proveedor
          </Link>
        ) : null}
      </header>

      <form method="GET" className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            name="consorcioId"
            defaultValue={consorcioIdParam}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Todos los consorcios</option>
            {consorcios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <div />

          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Filtrar
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-sm text-slate-600">
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Telefono</th>
                <th className="px-4 py-3 font-medium">Consorcios</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800">
              {proveedoresOrdenados.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-4 text-slate-500" colSpan={6}>
                    Sin proveedores cargados.
                  </td>
                </tr>
              ) : (
                proveedoresOrdenados.map((proveedor) => {
                  const activo = proveedor.fechaBaja === null;
                  const rowClass = activo ? "" : "bg-gray-50 text-gray-500";

                  const relacionesVisibles = access.isSuperAdmin
                    ? proveedor.consorcios
                    : proveedor.consorcios.filter((rel) => access.allowedConsorcioIds.includes(rel.consorcioId));

                  const canEdit =
                    access.isSuperAdmin ||
                    relacionesVisibles.some((rel) => manageRoleByConsorcio.has(rel.consorcioId) && isVigente(rel.desde, rel.hasta, today));

                  return (
                    <tr key={proveedor.id} className={`border-t border-slate-100 ${rowClass}`}>
                      <td className="px-4 py-4">{proveedor.nombre}</td>
                      <td className="px-4 py-4">{proveedor.tipo}</td>
                      <td className="px-4 py-4">{proveedor.telefono ?? "-"}</td>
                      <td className="px-4 py-4">
                        {relacionesVisibles.length === 0 ? (
                          "-"
                        ) : (
                          <div className="space-y-1">
                            {relacionesVisibles.map((rel) => (
                              <p key={rel.id}>
                                {rel.consorcio.nombre} ({formatDateAR(rel.desde)} - {formatDateAR(rel.hasta)})
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">{activo ? "Activo" : "Inactivo"}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Link href={`/proveedores/${proveedor.id}`} className="text-blue-600 hover:underline">
                            Ver
                          </Link>
                          {canEdit ? (
                            <Link href={`/proveedores/${proveedor.id}/editar`} className="text-blue-600 hover:underline">
                              Editar
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}



