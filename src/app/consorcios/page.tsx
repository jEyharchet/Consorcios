import Link from "next/link";
import { prisma } from "../../../lib/prisma";

export default async function ConsorciosPage() {
  const consorcios = await prisma.consorcio.findMany({
    include: { unidades: true },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
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
              <th className="px-4 py-3 font-medium">Dirección</th>
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
                  <td className="px-4 py-4">{c.nombre}</td>
                  <td className="px-4 py-4 text-slate-700">{c.direccion}</td>
                  <td className="px-4 py-4 text-slate-700">
                    {c.unidades.length}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
