import Link from "next/link";
import { redirect } from "next/navigation";

import { getActiveConsorcioContext } from "../../lib/consorcio-activo";
import { requireConsorcioRole } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import RegenerarArchivosButton from "./_components/RegenerarArchivosButton";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number, total: number) {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function estadoClass(estado: string) {
  if (estado === "CERRADA") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (estado === "EMITIDA") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-amber-100 text-amber-800";
}

export default async function LiquidacionesPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const { access, consorcios, activeConsorcioId } = await getActiveConsorcioContext();

  if (!access.isSuperAdmin && access.allowedConsorcioIds.length === 0) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          Tu cuenta aun no tiene acceso asignado. Contacta al administrador.
        </p>
      </main>
    );
  }

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo valido para mostrar.
        </p>
      </main>
    );
  }

  if (!access.isSuperAdmin && !access.allowedConsorcioIds.includes(activeConsorcioId)) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No tenes acceso al consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  const activeConsorcio = consorcios.find((c) => c.id === activeConsorcioId);

  const assignmentRole = access.isSuperAdmin
    ? "ADMIN"
    : access.assignments.find((a) => a.consorcioId === activeConsorcioId)?.role;

  const canOperate = access.isSuperAdmin || assignmentRole === "ADMIN" || assignmentRole === "OPERADOR";
  const canAdmin = access.isSuperAdmin || assignmentRole === "ADMIN";

  async function emitirDesdeListado(formData: FormData) {
    "use server";

    const liquidacionId = Number(formData.get("id"));
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      select: { id: true, consorcioId: true, estado: true },
    });

    if (!liquidacion) {
      redirect("/liquidaciones?error=liquidacion_inexistente");
    }

    await requireConsorcioRole(liquidacion.consorcioId, ["ADMIN"]);

    if (liquidacion.estado !== "BORRADOR") {
      redirect("/liquidaciones?error=estado_invalido_emitir");
    }

    const expensasCount = await prisma.expensa.count({ where: { liquidacionId: liquidacion.id } });
    if (expensasCount === 0) {
      redirect("/liquidaciones?error=sin_expensas_emitir");
    }

    await prisma.liquidacion.update({
      where: { id: liquidacion.id },
      data: { estado: "EMITIDA" },
    });

    redirect("/liquidaciones");
  }


  const [liquidaciones, gastosPendientes, expensasAbiertas, deudasExpensas, pagosAbiertos] = await Promise.all([
    prisma.liquidacion.findMany({
      where: { consorcioId: activeConsorcioId },
      orderBy: [{ periodo: "desc" }, { id: "desc" }],
      include: {
        archivos: {
          where: { activo: true },
          select: { id: true },
        },
      },
    }),
    prisma.gasto.findMany({
      where: {
        consorcioId: activeConsorcioId,
        OR: [{ liquidacionId: null }, { liquidacion: { estado: "BORRADOR" } }],
      },
      select: {
        id: true,
        monto: true,
        rubroExpensa: true,
        proveedor: { select: { nombre: true } },
        liquidacion: { select: { estado: true, periodo: true } },
      },
    }),
    prisma.expensa.findMany({
      where: {
        liquidacion: {
          consorcioId: activeConsorcioId,
          estado: { in: ["BORRADOR", "EMITIDA"] },
        },
      },
      select: {
        id: true,
        monto: true,
        saldo: true,
      },
    }),
    prisma.expensa.findMany({
      where: {
        liquidacion: {
          consorcioId: activeConsorcioId,
        },
        estado: { in: ["PENDIENTE", "PARCIAL"] },
      },
      select: {
        saldo: true,
        unidadId: true,
        liquidacion: { select: { periodo: true } },
      },
    }),
    prisma.pago.findMany({
      where: {
        expensa: {
          liquidacion: {
            consorcioId: activeConsorcioId,
            estado: { in: ["BORRADOR", "EMITIDA"] },
          },
        },
      },
      select: {
        id: true,
        monto: true,
        medioPago: true,
      },
    }),
  ]);

  const ultimaLiquidacion = liquidaciones[0] ?? null;

  const totalGastosPendientes = gastosPendientes.reduce((acc, g) => acc + g.monto, 0);

  const pendientesPorProveedorMap = new Map<string, number>();
  for (const gasto of gastosPendientes) {
    const abierto = !gasto.liquidacion || gasto.liquidacion.estado === "BORRADOR" || gasto.liquidacion.estado === "EMITIDA";
    if (!abierto) {
      continue;
    }

    const proveedor = gasto.proveedor?.nombre ?? "Sin proveedor";
    pendientesPorProveedorMap.set(proveedor, (pendientesPorProveedorMap.get(proveedor) ?? 0) + gasto.monto);
  }

  const pendientesPorProveedor = Array.from(pendientesPorProveedorMap.entries())
    .map(([proveedor, monto]) => ({ proveedor, monto }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 8);

  const totalPendienteProveedores = pendientesPorProveedor.reduce((acc, item) => acc + item.monto, 0);

  const totalLiquidadoAbierto = expensasAbiertas.reduce((acc, e) => acc + e.monto, 0);
  const totalPendienteAbierto = expensasAbiertas.reduce((acc, e) => acc + e.saldo, 0);
  const totalRecaudadoAbierto = totalLiquidadoAbierto - totalPendienteAbierto;

  const cobradoExpensas = pagosAbiertos.reduce((acc, p) => acc + p.monto, 0);
  const cobranzasDeuda = 0;

  const descuentos = 0;
  const identificacionCobranzas = pagosAbiertos.length;

  const deudaPorPeriodoMap = new Map<string, number>();
  const unidadesConDeuda = new Set<number>();

  for (const deuda of deudasExpensas) {
    const periodo = deuda.liquidacion.periodo;
    deudaPorPeriodoMap.set(periodo, (deudaPorPeriodoMap.get(periodo) ?? 0) + deuda.saldo);
    unidadesConDeuda.add(deuda.unidadId);
  }

  const deudaPorPeriodo = Array.from(deudaPorPeriodoMap.entries())
    .map(([periodo, monto]) => ({ periodo, monto }))
    .sort((a, b) => b.periodo.localeCompare(a.periodo));

  const totalDeuda = deudaPorPeriodo.reduce((acc, item) => acc + item.monto, 0);

  const sueldosPendientes = gastosPendientes.filter((g) => g.rubroExpensa.includes("Sueldos"));
  const sueldosCantidad = sueldosPendientes.length;
  const sueldosMonto = sueldosPendientes.reduce((acc, g) => acc + g.monto, 0);

  const cobranzasCantidadAbiertas = pagosAbiertos.length;
  const cobranzasMontoAbiertas = pagosAbiertos.reduce((acc, p) => acc + p.monto, 0);
  const liquidacionesAbiertasCount = liquidaciones.filter((l) => l.estado === "BORRADOR" || l.estado === "EMITIDA").length;

  const errorMessage =
    searchParams?.error === "sin_expensas_emitir"
      ? "No se puede emitir una liquidacion sin expensas generadas."
      : searchParams?.error === "estado_invalido_emitir"
        ? "Solo se puede emitir una liquidacion en estado BORRADOR."
        : searchParams?.error === "liquidacion_inexistente"
          ? "La liquidacion indicada no existe."
          : searchParams?.error === "estado_no_regenerable"
            ? "Solo se pueden regenerar archivos de liquidaciones CERRADAS o FINALIZADAS."
            : searchParams?.error === "regeneracion_error"
              ? "No se pudieron regenerar los archivos. Se conservaron los archivos anteriores."
              : null;

  const okMessage = null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Liquidaciones - {activeConsorcio?.nombre ?? `Consorcio #${activeConsorcioId}`}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Panel operativo de pendiente a liquidar del consorcio activo.</p>
        </div>

        {canOperate ? (
          <Link
            href="/liquidaciones/nueva"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Nueva liquidacion
          </Link>
        ) : null}
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {okMessage ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{okMessage}</div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Saldos</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-slate-600">Caja</span><span className="font-medium">{formatCurrency(pagosAbiertos.filter((p) => p.medioPago === "EFECTIVO").reduce((a, p) => a + p.monto, 0))}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Cuenta bancaria principal</span><span className="font-medium">{formatCurrency(pagosAbiertos.filter((p) => p.medioPago === "TRANSFERENCIA" || p.medioPago === "DEBITO" || p.medioPago === "CREDITO").reduce((a, p) => a + p.monto, 0))}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Cheques de terceros</span><span className="font-medium">{formatCurrency(pagosAbiertos.filter((p) => p.medioPago === "CHEQUE").reduce((a, p) => a + p.monto, 0))}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Otros fondos</span><span className="font-medium">{formatCurrency(pagosAbiertos.filter((p) => p.medioPago === "OTRO").reduce((a, p) => a + p.monto, 0))}</span></div>
          </div>
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>TOTAL</span>
              <span>{formatCurrency(pagosAbiertos.reduce((a, p) => a + p.monto, 0))}</span>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Pendiente de pago</h2>
          <div className="mt-4 space-y-2 text-sm">
            {pendientesPorProveedor.length === 0 ? (
              <p className="text-slate-500">Sin gastos pendientes de liquidacion por proveedor.</p>
            ) : (
              pendientesPorProveedor.map((item) => (
                <div key={item.proveedor} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                  <span className="truncate text-slate-700">{item.proveedor}</span>
                  <span className="whitespace-nowrap text-slate-900">{formatCurrency(item.monto)} ({formatPercent(item.monto, totalPendienteProveedores)})</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-3 text-sm font-semibold flex items-center justify-between">
            <span>TOTAL PENDIENTE</span>
            <span>{formatCurrency(totalPendienteProveedores)}</span>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Cobranzas y saldos de liquidaciones abiertas</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-slate-600">Liquidado expensas</span><span className="font-medium">{formatCurrency(totalLiquidadoAbierto)}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Total recaudado</span><span className="font-medium">{formatCurrency(totalRecaudadoAbierto)} ({formatPercent(totalRecaudadoAbierto, totalLiquidadoAbierto)})</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Total pendiente</span><span className="font-medium">{formatCurrency(totalPendienteAbierto)}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Cobrado expensas</span><span className="font-medium">{formatCurrency(cobradoExpensas)}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Cobrado deudas</span><span className="font-medium">{formatCurrency(cobranzasDeuda)}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Descuentos</span><span className="font-medium">{formatCurrency(descuentos)}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Identificacion de cobranzas</span><span className="font-medium">{identificacionCobranzas}</span></div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Deudas de vecinos sin intereses</h2>
          <div className="mt-4 space-y-2 text-sm">
            {deudaPorPeriodo.length === 0 ? (
              <p className="text-slate-500">No hay deudas pendientes.</p>
            ) : (
              deudaPorPeriodo.slice(0, 8).map((item) => (
                <div key={item.periodo} className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-700">{item.periodo}</span>
                  <span className="font-medium text-slate-900">{formatCurrency(item.monto)} ({formatPercent(item.monto, totalDeuda)})</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-3 text-sm font-semibold">
            {unidadesConDeuda.size} unidades con deudas
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Resumen pendiente a liquidar</h2>
          <p className="mt-1 text-sm text-slate-500">Incluye gastos no consolidados en liquidaciones cerradas/emitidas.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Gastos pendientes</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{gastosPendientes.length}</p>
              <p className="mt-1 text-sm text-slate-600">{formatCurrency(totalGastosPendientes)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Cobranzas abiertas</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{cobranzasCantidadAbiertas}</p>
              <p className="mt-1 text-sm text-slate-600">{formatCurrency(cobranzasMontoAbiertas)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Sueldos pendientes</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{sueldosCantidad}</p>
              <p className="mt-1 text-sm text-slate-600">{formatCurrency(sueldosMonto)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Liquidaciones abiertas</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{liquidacionesAbiertasCount}</p>
              <p className="mt-1 text-sm text-slate-600">Ultima: {ultimaLiquidacion?.periodo ?? "-"}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-sm text-slate-600">
                <th className="px-4 py-3 font-medium">Periodo</th>
                <th className="px-4 py-3 font-medium">Fecha emision</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800">
              {liquidaciones.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-4 text-slate-500" colSpan={5}>
                    Sin liquidaciones para este consorcio.
                  </td>
                </tr>
              ) : (
                liquidaciones.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-4 py-4">{l.periodo}</td>
                    <td className="px-4 py-4">{l.fechaEmision.toLocaleDateString()}</td>
                    <td className="px-4 py-4">{formatCurrency(l.total ?? 0)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${estadoClass(l.estado)}`}>
                        {l.estado}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Link href={`/liquidaciones/${l.id}`} className="text-blue-600 hover:underline">
                          Ver
                        </Link>
                        {l.estado === "BORRADOR" ? (
                          <Link href={`/liquidaciones/${l.id}/editar`} className="text-blue-600 hover:underline">
                            Editar
                          </Link>
                        ) : null}
                        {(l.estado === "FINALIZADA" || l.estado === "CERRADA") && l.archivos.length > 0 ? (
                          <Link href={`/liquidaciones/${l.id}#archivos`} className="text-blue-600 hover:underline">
                            Archivos
                          </Link>
                        ) : null}
                        {(l.estado === "FINALIZADA" || l.estado === "CERRADA") && canOperate ? (
                          <RegenerarArchivosButton liquidacionId={l.id} />
                        ) : null}
                        {l.estado === "BORRADOR" && canAdmin ? (
                          <form action={emitirDesdeListado}>
                            <input type="hidden" name="id" value={l.id} />
                            <button type="submit" className="text-blue-600 hover:underline">
                              Emitir
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}








