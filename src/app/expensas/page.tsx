import Link from "next/link";
import { redirect } from "next/navigation";

import { getActiveConsorcioContext } from "../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../lib/onboarding";
import { normalizePeriodo } from "../../lib/periodo";
import { prisma } from "../../lib/prisma";
import { isVigente, normalizeDate } from "../../lib/relaciones";

function formatResponsables(
  relaciones: Array<{ desde: Date; hasta: Date | null; persona: { apellido: string; nombre: string } }>,
  today: Date,
) {
  const vigentes = relaciones.filter((relacion) => isVigente(relacion.desde, relacion.hasta, today));

  if (vigentes.length === 0) {
    return ["Sin responsable"];
  }

  return vigentes.map((relacion) => `${relacion.persona.apellido}, ${relacion.persona.nombre}`);
}

export default async function ExpensasPage({
  searchParams,
}: {
  searchParams?: { consorcioId?: string; periodo?: string; estado?: string };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  const today = normalizeDate(new Date());

  redirectToOnboardingIfNoConsorcios(access);

  const rawConsorcioIdParam = (searchParams?.consorcioId ?? "").trim();
  const consorcioIdParam = rawConsorcioIdParam || (activeConsorcioId ? String(activeConsorcioId) : "");
  const periodoInput = (searchParams?.periodo ?? "").trim();
  const periodo = normalizePeriodo(periodoInput) ?? periodoInput;
  const estado = (searchParams?.estado ?? "").trim();

  const consorcioId = consorcioIdParam ? Number(consorcioIdParam) : null;
  if (consorcioIdParam && (!Number.isInteger(consorcioId) || (consorcioId ?? 0) <= 0)) {
    redirect("/expensas");
  }

  if (!access.isSuperAdmin && consorcioId && !access.allowedConsorcioIds.includes(consorcioId)) {
    redirect("/expensas");
  }

  const consorcios = await prisma.consorcio.findMany({
    where: access.isSuperAdmin ? undefined : { id: { in: access.allowedConsorcioIds } },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  const expensas = await prisma.expensa.findMany({
    where: {
      liquidacion: {
        consorcioId: access.isSuperAdmin
          ? consorcioId ?? undefined
          : consorcioId
            ? consorcioId
            : { in: access.allowedConsorcioIds },
        periodo: periodo || undefined,
      },
      estado: estado || undefined,
    },
    include: {
      liquidacion: {
        select: {
          id: true,
          periodo: true,
          consorcio: { select: { id: true, nombre: true } },
        },
      },
      unidad: {
        select: {
          id: true,
          identificador: true,
          tipo: true,
          personas: {
            orderBy: [{ desde: "desc" }, { persona: { apellido: "asc" } }, { persona: { nombre: "asc" } }, { id: "asc" }],
            select: {
              desde: true,
              hasta: true,
              persona: {
                select: {
                  apellido: true,
                  nombre: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ id: "desc" }],
  });

  const rolesByConsorcio = new Map(access.assignments.map((a) => [a.consorcioId, a.role]));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Expensas</h1>
      </header>

      <form method="GET" className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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

          <input
            name="periodo"
            defaultValue={periodo}
            placeholder="Periodo (ej: 2026-03)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          <select
            name="estado"
            defaultValue={estado}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="PAGADA">PAGADA</option>
            <option value="PARCIAL">PARCIAL</option>
          </select>

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
                <th className="px-4 py-3 font-medium">Consorcio</th>
                <th className="px-4 py-3 font-medium">Periodo</th>
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 font-medium">Responsable/s</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800">
              {expensas.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={8} className="px-4 py-4 text-slate-500">
                    Sin expensas para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                expensas.map((expensa) => {
                  const responsables = formatResponsables(expensa.unidad.personas, today);

                  return (
                    <tr key={expensa.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-4">{expensa.liquidacion.consorcio.nombre}</td>
                      <td className="px-4 py-4">{expensa.liquidacion.periodo}</td>
                      <td className="px-4 py-4">
                        <Link href={`/expensas/${expensa.id}`} className="text-blue-600 hover:underline">
                          {expensa.unidad.identificador} ({expensa.unidad.tipo})
                        </Link>
                      </td>
                      <td className="px-4 py-4 min-w-[220px]">
                        <div className="space-y-1 text-slate-700">
                          {responsables.map((responsable) => (
                            <div key={responsable}>{responsable}</div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4">{expensa.monto.toFixed(2)}</td>
                      <td className="px-4 py-4">{expensa.saldo.toFixed(2)}</td>
                      <td className="px-4 py-4">{expensa.estado}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Link href={`/expensas/${expensa.id}`} className="text-blue-600 hover:underline">
                            Ver
                          </Link>
                          {access.isSuperAdmin ||
                          rolesByConsorcio.get(expensa.liquidacion.consorcio.id) === "ADMIN" ? (
                            expensa.estado !== "PAGADA" ? (
                              <Link href={`/expensas/${expensa.id}/pago`} className="text-blue-600 hover:underline">
                                Registrar cobranza
                              </Link>
                            ) : null
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




