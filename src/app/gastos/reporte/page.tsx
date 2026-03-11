import Link from "next/link";

import { getAccessContext } from "../../../lib/auth";
import { redirectToOnboardingIfNoConsorcios } from "../../../lib/onboarding";
import { getCurrentPeriodo, getPeriodoVariants } from "../../../lib/periodo";
import { prisma } from "../../../lib/prisma";

export default async function ReporteGastosPage() {
  const access = await getAccessContext();

  redirectToOnboardingIfNoConsorcios(access);

  const whereBase = access.isSuperAdmin ? {} : { consorcioId: { in: access.allowedConsorcioIds } };
  const periodoActual = getCurrentPeriodo();

  const [gastos, gastosPeriodo] = await Promise.all([
    prisma.gasto.findMany({
      where: whereBase,
      include: {
        consorcio: {
          select: { id: true, nombre: true },
        },
      },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
    }),
    prisma.gasto.findMany({
      where: {
        ...whereBase,
        periodo: { in: getPeriodoVariants(periodoActual) },
      },
      select: {
        monto: true,
      },
    }),
  ]);

  const totalGastos = gastos.reduce((acc, item) => acc + item.monto, 0);
  const totalPeriodoActual = gastosPeriodo.reduce((acc, item) => acc + item.monto, 0);

  const rubrosMap = new Map<string, number>();
  const consorciosMap = new Map<string, number>();

  for (const gasto of gastos) {
    rubrosMap.set(gasto.rubroExpensa, (rubrosMap.get(gasto.rubroExpensa) ?? 0) + gasto.monto);
    consorciosMap.set(gasto.consorcio.nombre, (consorciosMap.get(gasto.consorcio.nombre) ?? 0) + gasto.monto);
  }

  const topRubros = Array.from(rubrosMap.entries())
    .map(([rubro, monto]) => ({ rubro, monto }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5);

  const topConsorcios = Array.from(consorciosMap.entries())
    .map(([consorcio, monto]) => ({ consorcio, monto }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reporte de gastos</h1>
          <p className="mt-1 text-sm text-slate-600">Vista inicial del panel contable de gastos.</p>
        </div>
        <Link href="/gastos" className="text-blue-600 hover:underline">
          Ver listado de gastos
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Cantidad de gastos</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{gastos.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Monto total acumulado</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{totalGastos.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Monto periodo actual ({periodoActual})</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{totalPeriodoActual.toFixed(2)}</p>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Top rubros</h2>
          {topRubros.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Sin datos para mostrar.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {topRubros.map((item) => (
                <li key={item.rubro} className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-700">{item.rubro}</span>
                  <span className="font-medium text-slate-900">{item.monto.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Consorcios con mayor gasto</h2>
          {topConsorcios.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Sin datos para mostrar.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {topConsorcios.map((item) => (
                <li key={item.consorcio} className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-700">{item.consorcio}</span>
                  <span className="font-medium text-slate-900">{item.monto.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}





