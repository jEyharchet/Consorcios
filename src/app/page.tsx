import Link from "next/link";

import { getAccessContext } from "../lib/auth";
import { normalizeDate } from "../lib/relaciones";
import { prisma } from "../lib/prisma";

const resumenConfig = [
  { titulo: "Consorcios", href: "/consorcios" },
  { titulo: "Unidades", href: "/unidades" },
  { titulo: "Personas", href: "/personas" },
  { titulo: "Proveedores", href: "/proveedores" },
] as const;

const accesosRapidos = [
  { label: "Consorcios", href: "/consorcios" },
  { label: "Unidades", href: "/unidades" },
  { label: "Personas", href: "/personas" },
  { label: "Proveedores", href: "/proveedores" },
  { label: "Gastos", href: "/gastos" },
  { label: "Liquidaciones", href: "/liquidaciones" },
  { label: "Expensas", href: "/expensas" },
] as const;

export default async function Home() {
  const access = await getAccessContext();

  if (!access.isSuperAdmin && access.allowedConsorcioIds.length === 0) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10">
        <header className="mb-6 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Administracion de Consorcios</h1>
          <p className="text-slate-600">Bienvenido, {access.user.name ?? access.user.email ?? "usuario"}.</p>
        </header>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Tu cuenta aun no tiene acceso asignado. Contacta al administrador.
        </div>
      </main>
    );
  }

  const today = normalizeDate(new Date());
  const unidadWhere = access.isSuperAdmin ? undefined : { consorcioId: { in: access.allowedConsorcioIds } };
  const proveedorWhere = access.isSuperAdmin
    ? undefined
    : {
        consorcios: {
          some: {
            consorcioId: { in: access.allowedConsorcioIds },
            desde: { lte: today },
            OR: [{ hasta: null }, { hasta: { gte: today } }],
          },
        },
      };

  const [consorcios, unidades, personas, proveedores] = await Promise.all([
    prisma.consorcio.count(access.isSuperAdmin ? {} : { where: { id: { in: access.allowedConsorcioIds } } }),
    prisma.unidad.count({ where: unidadWhere }),
    prisma.persona.count({
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
    }),
    prisma.proveedor.count({ where: proveedorWhere }),
  ]);

  const resumen = [consorcios, unidades, personas, proveedores];

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <header className="mb-8 space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Administracion de Consorcios</h1>
        <p className="text-lg text-slate-600">Panel general del sistema</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {resumenConfig.map((item, index) => (
          <Link
            key={item.titulo}
            href={item.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
          >
            <p className="text-sm font-medium text-slate-600">{item.titulo}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{resumen[index]}</p>
            <p className="mt-3 text-sm text-blue-600">Ir al modulo</p>
          </Link>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Accesos rapidos</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {accesosRapidos.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {item.label}
            </Link>
          ))}

          {access.user.role === "SUPER_ADMIN" ? (
            <Link
              href="/usuarios"
              className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Usuarios
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
