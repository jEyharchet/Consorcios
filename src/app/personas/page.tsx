import Link from "next/link";

import { getAccessContext } from "../../lib/auth";
import { redirectToOnboardingIfNoConsorcios } from "../../lib/onboarding";
import { prisma } from "../../lib/prisma";

export default async function PersonasPage() {
  const access = await getAccessContext();

  redirectToOnboardingIfNoConsorcios(access);

  const personas = await prisma.persona.findMany({
    where: access.isSuperAdmin
      ? undefined
      : {
          unidades: {
            some: {
              unidad: {
                consorcioId: { in: access.allowedConsorcioIds },
              },
            },
          },
        },
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
    select: {
      id: true,
      nombre: true,
      apellido: true,
      email: true,
      telefono: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <Link href="/" className="mb-4 inline-block text-blue-600 hover:underline">
        Volver al inicio
      </Link>
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Personas</h1>

        <Link
          href="/personas/nueva"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nueva persona
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Apellido</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Telefono</th>
            </tr>
          </thead>

          <tbody className="text-sm text-slate-800">
            {personas.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td className="px-4 py-4 text-slate-500" colSpan={4}>
                  Sin personas cargadas.
                </td>
              </tr>
            ) : (
              personas.map((persona) => (
                <tr key={persona.id} className="border-t border-slate-100">
                  <td className="px-4 py-4">
                    <Link href={`/personas/${persona.id}`} className="text-blue-600 hover:underline">
                      {persona.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{persona.apellido}</td>
                  <td className="px-4 py-4 text-slate-700">{persona.email ?? "-"}</td>
                  <td className="px-4 py-4 text-slate-700">{persona.telefono ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}



