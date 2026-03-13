import type { Prisma } from "@prisma/client";
import Link from "next/link";

import { getActiveConsorcioContext } from "../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../lib/onboarding";
import { normalizePeriodo } from "../../lib/periodo";
import { prisma } from "../../lib/prisma";
import { isVigente, normalizeDate } from "../../lib/relaciones";
import ExpensaKpis from "./_components/ExpensaKpis";
import ExpensasTable, { type ExpensaTableRow } from "./_components/ExpensasTable";
import type { ExpensaEstadoVisual } from "./_components/ExpensaEstadoBadge";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatResponsables(
  relaciones: Array<{ desde: Date; hasta: Date | null; persona: { apellido: string; nombre: string } }>,
  today: Date,
) {
  const vigentes = relaciones.filter((relacion) => isVigente(relacion.desde, relacion.hasta, today));

  if (vigentes.length === 0) {
    return "Sin responsable";
  }

  return vigentes.map((relacion) => `${relacion.persona.apellido}, ${relacion.persona.nombre}`).join(" / ");
}

function resolveVisualStatus(params: {
  saldo: number;
  estado: string;
  fechaVencimiento: Date | null;
  today: Date;
}): ExpensaEstadoVisual {
  if (params.saldo <= 0.009 || params.estado === "PAGADA") {
    return "PAGADA";
  }

  if (params.fechaVencimiento && normalizeDate(params.fechaVencimiento) < params.today) {
    return "VENCIDA";
  }

  return "PENDIENTE";
}

function buildSearchConditions(search: string, today: Date): Prisma.ExpensaWhereInput[] {
  return search
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({
      OR: [
        {
          unidad: {
            identificador: {
              contains: token,
              mode: "insensitive",
            },
          },
        },
        {
          unidad: {
            personas: {
              some: {
                desde: { lte: today },
                OR: [{ hasta: null }, { hasta: { gte: today } }],
                persona: {
                  OR: [
                    {
                      apellido: {
                        contains: token,
                        mode: "insensitive",
                      },
                    },
                    {
                      nombre: {
                        contains: token,
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    }));
}

export default async function ExpensasPage({
  searchParams,
}: {
  searchParams?: { periodo?: string; estado?: string; buscar?: string };
}) {
  const { access, consorcios, activeConsorcioId } = await getActiveConsorcioContext();
  const today = normalizeDate(new Date());

  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Expensas</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo valido para mostrar.
        </p>
      </main>
    );
  }

  if (!access.isSuperAdmin && !access.allowedConsorcioIds.includes(activeConsorcioId)) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Expensas</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No tenes acceso al consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  const activeConsorcio = consorcios.find((consorcio) => consorcio.id === activeConsorcioId);
  const assignmentRole = access.assignments.find((assignment) => assignment.consorcioId === activeConsorcioId)?.role;
  const canRegisterPayments = access.isSuperAdmin || assignmentRole === "ADMIN";

  const periodos = await prisma.liquidacion.findMany({
    where: { consorcioId: activeConsorcioId },
    distinct: ["periodo"],
    orderBy: { periodo: "desc" },
    select: { periodo: true },
  });

  const rawSearch = (searchParams?.buscar ?? "").trim();
  const rawEstado = (searchParams?.estado ?? "").trim().toUpperCase();
  const selectedEstado = rawEstado === "PAGADA" || rawEstado === "PENDIENTE" ? rawEstado : "";
  const defaultPeriodo = periodos[0]?.periodo ?? "";
  const selectedPeriodo = normalizePeriodo((searchParams?.periodo ?? "").trim()) ?? defaultPeriodo;

  const expensas = await prisma.expensa.findMany({
    where: {
      liquidacion: {
        consorcioId: activeConsorcioId,
        periodo: selectedPeriodo || undefined,
      },
      ...(selectedEstado === "PAGADA" ? { saldo: { lte: 0.009 } } : {}),
      ...(selectedEstado === "PENDIENTE" ? { saldo: { gt: 0.009 } } : {}),
      ...(rawSearch ? { AND: buildSearchConditions(rawSearch, today) } : {}),
    },
    include: {
      liquidacion: {
        select: {
          fechaVencimiento: true,
        },
      },
      unidad: {
        select: {
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
    orderBy: [{ unidad: { identificador: "asc" } }, { id: "desc" }],
  });

  const rows: ExpensaTableRow[] = expensas.map((expensa) => ({
    id: expensa.id,
    unidad: `${expensa.unidad.identificador} (${expensa.unidad.tipo})`,
    responsable: formatResponsables(expensa.unidad.personas, today),
    capital: formatCurrency(expensa.monto),
    saldo: formatCurrency(expensa.saldo),
    estado: resolveVisualStatus({
      saldo: expensa.saldo,
      estado: expensa.estado,
      fechaVencimiento: expensa.liquidacion.fechaVencimiento,
      today,
    }),
    canRegisterPayment: canRegisterPayments,
  }));

  const pendientesCount = rows.filter((row) => row.estado !== "PAGADA").length;
  const pagadasCount = rows.filter((row) => row.estado === "PAGADA").length;
  const deudaTotal = expensas.reduce((acc, item) => acc + item.saldo, 0);
  const periodoLabel = selectedPeriodo || "Sin periodo";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Expensas · {activeConsorcio?.nombre ?? `Consorcio #${activeConsorcioId}`}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Panel operativo para seguimiento de deuda, cobro y estado del periodo seleccionado.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Periodo activo</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{periodoLabel}</p>
        </div>
      </header>

      <ExpensaKpis
        items={[
          {
            label: "Expensas del periodo",
            value: String(rows.length),
            detail: selectedPeriodo ? `Liquidacion ${selectedPeriodo}` : "Sin periodo filtrado",
          },
          {
            label: "Pendientes",
            value: String(pendientesCount),
            detail: "Incluye pendientes y vencidas con saldo abierto",
          },
          {
            label: "Pagadas",
            value: String(pagadasCount),
            detail: "Expensas canceladas completamente",
          },
          {
            label: "Deuda total",
            value: formatCurrency(deudaTotal),
            detail: "Saldo aun por cobrar del periodo visible",
          },
        ]}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
        <div className="mb-5 flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-950">Filtros</h2>
          <p className="text-sm text-slate-500">Usa el consorcio activo del sidebar y filtra solo lo necesario para operar rapido.</p>
        </div>

        <form method="GET" className="grid gap-4 lg:grid-cols-[220px_220px_minmax(0,1fr)_auto]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Periodo</span>
            <select
              name="periodo"
              defaultValue={selectedPeriodo}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
            >
              {periodos.length === 0 ? <option value="">Sin periodos</option> : null}
              {periodos.map((periodo) => (
                <option key={periodo.periodo} value={periodo.periodo}>
                  {periodo.periodo}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Estado</span>
            <select
              name="estado"
              defaultValue={selectedEstado}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="PAGADA">Pagadas</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Buscar</span>
            <input
              name="buscar"
              defaultValue={rawSearch}
              placeholder="UF 08, Eyharchet, Ruiz"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-500 placeholder:text-slate-400 focus:ring-2"
            />
          </label>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="inline-flex h-[42px] items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Aplicar
            </button>
            <Link
              href="/expensas"
              className="inline-flex h-[42px] items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Expensas del periodo</h2>
            <p className="text-sm text-slate-500">Fila clickeable, estado visual y accion contextual para registrar pagos mas rapido.</p>
          </div>
        </div>

        <ExpensasTable rows={rows} />
      </section>
    </main>
  );
}


