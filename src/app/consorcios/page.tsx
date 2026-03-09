import Link from "next/link";

import { getAccessContext } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export default async function ConsorciosPage() {
  const access = await getAccessContext();

  if (!access.isSuperAdmin && access.allowedConsorcioIds.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <Link href="/" className="mb-4 inline-block text-blue-600 hover:underline">
          Volver al inicio
        </Link>
        <h1 className="text-2xl font-semibold">Consorcios</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          Tu cuenta aun no tiene acceso asignado. Contacta al administrador.
        </p>
      </main>
    );
  }

  const consorcios = await prisma.consorcio.findMany({
    where: access.isSuperAdmin ? undefined : { id: { in: access.allowedConsorcioIds } },
    include: { unidades: true },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <Link href="/" className="mb-4 inline-block text-blue-600 hover:underline">
        Volver al inicio
      </Link>
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Consorcios</h1>

        <Link
          href="/consorcios/nuevo"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nuevo consorcio
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Direccion</th>
              <th className="px-4 py-3 font-medium">Unidades</th>
            </tr>
          </thead>

          <tbody className="text-sm text-slate-800">
            {consorcios.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td className="px-4 py-4 text-slate-500" colSpan={3}>
                  No hay consorcios cargados.
                </td>
              </tr>
            ) : (
              consorcios.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-4">
                    <Link href={`/consorcios/${c.id}`} className="text-blue-600 hover:underline">
                      {c.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{c.direccion}</td>
                  <td className="px-4 py-4 text-slate-700">{c.unidades.length}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

