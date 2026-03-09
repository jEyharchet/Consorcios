import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccessContext, requireConsorcioAccess, requireConsorcioRole } from "../../../../../lib/auth";
import {
  aplicarRedondeoAuditable,
  calcularBaseFinanciera,
  type ProrrateoBaseUnidad,
} from "../../../../../lib/liquidacion-prorrateo";
import { prisma } from "../../../../../lib/prisma";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildUnidadLabel(unidad: {
  identificador: string;
  tipo: string;
  piso: string | null;
  departamento: string | null;
}) {
  const parts = [`${unidad.identificador} (${unidad.tipo})`];

  if (unidad.piso) {
    parts.push(`Piso ${unidad.piso}`);
  }

  if (unidad.departamento) {
    parts.push(`Depto ${unidad.departamento}`);
  }

  return parts.join(" / ");
}

async function calcularSnapshotPaso3(liquidacionId: number) {
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    include: {
      consorcio: { select: { id: true, nombre: true } },
      deudas: {
        include: {
          expensa: {
            select: {
              unidadId: true,
            },
          },
        },
      },
    },
  });

  if (!liquidacion) {
    return null;
  }

  const unidades = await prisma.unidad.findMany({
    where: { consorcioId: liquidacion.consorcioId },
    select: {
      id: true,
      identificador: true,
      tipo: true,
      piso: true,
      departamento: true,
      porcentajeExpensas: true,
    },
    orderBy: [{ piso: "asc" }, { departamento: "asc" }, { identificador: "asc" }, { id: "asc" }],
  });

  const faltanCoeficientes = unidades.some((u) => u.porcentajeExpensas === null);

  const deudaByUnidad = new Map<number, { saldoAnterior: number; pagosPeriodo: number; intereses: number; saldoAFavor: number }>();

  for (const deuda of liquidacion.deudas) {
    const unitId = deuda.expensa.unidadId;
    const prev = deudaByUnidad.get(unitId) ?? { saldoAnterior: 0, pagosPeriodo: 0, intereses: 0, saldoAFavor: 0 };

    if (deuda.criterio === "TOTAL") {
      prev.saldoAnterior += deuda.capitalOriginal;
      prev.intereses += deuda.interesCalculado;
    } else if (deuda.criterio === "CAPITAL") {
      prev.saldoAnterior += deuda.capitalOriginal;
    } else if (deuda.criterio === "INTERES") {
      prev.intereses += deuda.interesCalculado;
    } else if (deuda.criterio === "PARCIAL") {
      prev.saldoAnterior += deuda.importeLiquidado;
    }

    deudaByUnidad.set(unitId, prev);
  }

  const baseRows: ProrrateoBaseUnidad[] = unidades.map((unidad) => {
    const deuda = deudaByUnidad.get(unidad.id);

    return {
      unidadId: unidad.id,
      unidadLabel: buildUnidadLabel(unidad),
      coeficiente: (unidad.porcentajeExpensas ?? 0) / 100,
      saldoAnterior: deuda?.saldoAnterior ?? 0,
      pagosPeriodo: deuda?.pagosPeriodo ?? 0,
      intereses: deuda?.intereses ?? 0,
      saldoAFavor: deuda?.saldoAFavor ?? 0,
    };
  });

  const totalOrdinarias = liquidacion.montoOrdinarias ?? 0;
  const totalFondoReserva = liquidacion.montoFondoReserva ?? 0;
  const baseProrrateable = totalOrdinarias + totalFondoReserva;

  const calculadas = calcularBaseFinanciera(baseRows, baseProrrateable);
  const rounded = aplicarRedondeoAuditable(calculadas);

  return {
    liquidacion,
    faltanCoeficientes,
    totalOrdinarias,
    totalFondoReserva,
    baseProrrateable,
    ...rounded,
  };
}

async function persistirSnapshotPaso3(liquidacionId: number) {
  const snapshot = await calcularSnapshotPaso3(liquidacionId);

  if (!snapshot) {
    return { ok: false as const, reason: "liquidacion_inexistente" };
  }

  if (snapshot.faltanCoeficientes) {
    return { ok: false as const, reason: "coeficientes_faltantes" };
  }

  const data = snapshot.rows.map((row) => ({
    liquidacionId: snapshot.liquidacion.id,
    unidadId: row.unidadId,
    coeficiente: row.coeficiente,
    saldoAnterior: row.saldoAnterior,
    pagosPeriodo: row.pagosPeriodo,
    saldoDeudor: row.saldoDeudor,
    saldoAFavor: row.saldoAFavor,
    intereses: row.intereses,
    gastoOrdinario: row.gastoOrdinarioExacto,
    redondeo: row.redondeo,
    total: row.totalRedondeado,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.liquidacionProrrateoUnidad.deleteMany({ where: { liquidacionId: snapshot.liquidacion.id } });

    if (data.length > 0) {
      await tx.liquidacionProrrateoUnidad.createMany({ data });
    }
  });

  return { ok: true as const, snapshot };
}

export default async function LiquidacionWizardPaso3Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; ok?: string };
}) {
  const id = Number(params.id);

  const snapshot = await calcularSnapshotPaso3(id);

  if (!snapshot) {
    return <div className="p-6">Liquidacion no encontrada</div>;
  }

  await requireConsorcioAccess(snapshot.liquidacion.consorcioId);

  const access = await getAccessContext();
  const assignmentRole = access.isSuperAdmin
    ? "ADMIN"
    : access.assignments.find((a) => a.consorcioId === snapshot.liquidacion.consorcioId)?.role;

  const canOperate = access.isSuperAdmin || assignmentRole === "ADMIN" || assignmentRole === "OPERADOR";

  if (!canOperate) {
    redirect(`/liquidaciones/${snapshot.liquidacion.id}`);
  }

  async function guardarProrrateo() {
    "use server";

    const current = await prisma.liquidacion.findUnique({
      where: { id: snapshot.liquidacion.id },
      select: { id: true, consorcioId: true, estado: true },
    });

    if (!current) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(current.consorcioId, ["ADMIN", "OPERADOR"]);

    if (current.estado !== "BORRADOR") {
      redirect(`/liquidaciones/${current.id}/wizard/paso-3?error=estado_no_borrador`);
    }

    const result = await persistirSnapshotPaso3(current.id);

    if (!result.ok && result.reason === "coeficientes_faltantes") {
      redirect(`/liquidaciones/${current.id}/wizard/paso-3?error=coeficientes_faltantes`);
    }

    redirect(`/liquidaciones/${current.id}/wizard/paso-3?ok=guardado`);
  }

  async function confirmarProrrateoYContinuar() {
    "use server";

    const current = await prisma.liquidacion.findUnique({
      where: { id: snapshot.liquidacion.id },
      select: { id: true, consorcioId: true, estado: true },
    });

    if (!current) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(current.consorcioId, ["ADMIN", "OPERADOR"]);

    if (current.estado !== "BORRADOR") {
      redirect(`/liquidaciones/${current.id}/wizard/paso-3?error=estado_no_borrador`);
    }

    const result = await persistirSnapshotPaso3(current.id);

    if (!result.ok && result.reason === "coeficientes_faltantes") {
      redirect(`/liquidaciones/${current.id}/wizard/paso-3?error=coeficientes_faltantes`);
    }

    await prisma.liquidacion.update({
      where: { id: current.id },
      data: { wizardPasoActual: 4 },
    });

    redirect(`/liquidaciones/${current.id}/wizard/paso-4`);
  }

  const totalSinIntereses = snapshot.rows.reduce((acc, row) => acc + row.saldoDeudor + row.gastoOrdinarioExacto, 0);
  const totalFinal = snapshot.rows.reduce((acc, row) => acc + row.totalRedondeado, 0);

  const message =
    searchParams?.error === "coeficientes_faltantes" || snapshot.faltanCoeficientes
      ? "No se puede prorratear: hay unidades sin porcentaje de expensas."
      : searchParams?.error === "estado_no_borrador"
        ? "Solo se puede operar el Paso 3 en liquidaciones BORRADOR."
        : searchParams?.ok === "guardado"
          ? "Snapshot del Paso 3 guardado correctamente."
          : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/liquidaciones/${snapshot.liquidacion.id}/wizard/paso-2`} className="text-blue-600 hover:underline">
          Volver al Paso 2
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Liquidacion de expensas: Prorrateo de gastos</h1>
        <p className="mt-1 text-sm text-slate-600">Consorcio: {snapshot.liquidacion.consorcio.nombre}</p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 1</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 2</div>
        <div className="rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white">PASO 3</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 4</div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p>
          El Paso 3 usa los valores consolidados en Paso 2 (deuda/intereses) y distribuye por coeficiente la base del
          periodo (gastos ordinarios + fondo de reserva). No recalcula intereses historicos.
        </p>
      </section>

      {message ? (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[1100px] w-full border-collapse">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-4 py-3 font-medium">Unidad funcional</th>
              <th className="px-4 py-3 font-medium">Saldo anterior</th>
              <th className="px-4 py-3 font-medium">Pagos del periodo</th>
              <th className="px-4 py-3 font-medium">Saldo deudor</th>
              <th className="px-4 py-3 font-medium">Intereses</th>
              <th className="px-4 py-3 font-medium">Prorrateo del periodo</th>
              <th className="px-4 py-3 font-medium">Redondeo</th>
              <th className="px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-800">
            {snapshot.rows.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td colSpan={8} className="px-4 py-4 text-slate-500">
                  No hay unidades para prorratear.
                </td>
              </tr>
            ) : (
              snapshot.rows.map((row) => (
                <tr key={row.unidadId} className="border-t border-slate-100">
                  <td className="px-4 py-4">{row.unidadLabel}</td>
                  <td className="px-4 py-4">{formatCurrency(row.saldoAnterior)}</td>
                  <td className="px-4 py-4">{formatCurrency(row.pagosPeriodo)}</td>
                  <td className="px-4 py-4">{formatCurrency(row.saldoDeudor)}</td>
                  <td className="px-4 py-4">{formatCurrency(row.intereses)}</td>
                  <td className="px-4 py-4">{formatCurrency(row.gastoOrdinarioExacto)}</td>
                  <td className="px-4 py-4">{formatCurrency(row.redondeo)}</td>
                  <td className="px-4 py-4 font-semibold">{formatCurrency(row.totalRedondeado)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Gastos ordinarios</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(snapshot.totalOrdinarias)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Fondo de reserva</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(snapshot.totalFondoReserva)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Base prorrateable</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(snapshot.baseProrrateable)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total sin intereses</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(totalSinIntereses)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total final (cerrado)</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(totalFinal)}</p>
        </div>
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/liquidaciones/${snapshot.liquidacion.id}/wizard/paso-2`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Volver
        </Link>

        <form action={guardarProrrateo}>
          <button
            type="submit"
            disabled={snapshot.faltanCoeficientes}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Guardar prorrateo
          </button>
        </form>

        <form action={confirmarProrrateoYContinuar}>
          <button
            type="submit"
            disabled={snapshot.faltanCoeficientes}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Confirmar prorrateo y continuar
          </button>
        </form>
      </section>
    </main>
  );
}
