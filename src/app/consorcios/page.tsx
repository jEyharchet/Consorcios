<<<<<<< codex/initialize-web-project-for-administracion-de-consorcios-nh0lji
import { prisma } from "../../../lib/prisma";

export default async function ConsorciosPage() {
  const consorcios = await prisma.consorcio.findMany({
    orderBy: { nombre: "asc" },
    include: { unidades: true },
  });

=======
export default function ConsorciosPage() {
>>>>>>> main
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Consorcios</h1>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Nuevo consorcio
        </button>
      </header>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Dirección</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Unidades</th>
            </tr>
          </thead>
          <tbody>
<<<<<<< codex/initialize-web-project-for-administracion-de-consorcios-nh0lji
            {consorcios.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td className="px-4 py-4 text-sm text-slate-500">—</td>
                <td className="px-4 py-4 text-sm text-slate-500">—</td>
                <td className="px-4 py-4 text-sm text-slate-700">0</td>
              </tr>
            ) : (
              consorcios.map((consorcio) => (
                <tr key={consorcio.id} className="border-t border-slate-100">
                  <td className="px-4 py-4 text-sm text-slate-700">{consorcio.nombre}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{consorcio.direccion}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{consorcio.unidades?.length ?? 0}</td>
                </tr>
              ))
            )}
=======
            <tr className="border-t border-slate-100">
              <td className="px-4 py-4 text-sm text-slate-500">—</td>
              <td className="px-4 py-4 text-sm text-slate-500">—</td>
              <td className="px-4 py-4 text-sm text-slate-700">0</td>
            </tr>
>>>>>>> main
          </tbody>
        </table>
      </div>
    </main>
  );
}
