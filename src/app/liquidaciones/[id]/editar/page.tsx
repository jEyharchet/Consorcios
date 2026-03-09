import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccessContext, requireConsorcioAccess, requireConsorcioRole } from "../../../../lib/auth";
import { getPeriodoVariants } from "../../../../lib/periodo";
import { prisma } from "../../../../lib/prisma";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function EditarLiquidacionPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; ok?: string };
}) {
  const id = Number(params.id);

  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id },
    include: {
      consorcio: { select: { id: true, nombre: true } },
    },
  });

  if (!liquidacion) {
    return <div className="p-6">Liquidacion no encontrada</div>;
  }

  await requireConsorcioAccess(liquidacion.consorcioId);
  const access = await getAccessContext();

  const assignmentRole = access.isSuperAdmin
    ? "ADMIN"
    : access.assignments.find((a) => a.consorcioId === liquidacion.consorcioId)?.role;

  const canOperate = access.isSuperAdmin || assignmentRole === "ADMIN" || assignmentRole === "OPERADOR";
  const canAdmin = access.isSuperAdmin || assignmentRole === "ADMIN";

  if (!canOperate) {
    redirect(`/liquidaciones/${liquidacion.id}`);
  }

  const periodoVariants = getPeriodoVariants(liquidacion.periodo);

  const [gastos, sueldos, expensasLiquidacion, deudasExpensas, cobranzasPeriodo] = await Promise.all([
    prisma.gasto.findMany({
      where: {
        consorcioId: liquidacion.consorcioId,
        periodo: { in: periodoVariants },
      },
      select: {
        id: true,
        monto: true,
      },
    }),
    prisma.gasto.findMany({
      where: {
        consorcioId: liquidacion.consorcioId,
        periodo: { in: periodoVariants },
        rubroExpensa: { contains: "Sueldos" },
      },
      select: { id: true, monto: true },
    }),
    prisma.expensa.findMany({
      where: { liquidacionId: liquidacion.id },
      select: {
        id: true,
        unidadId: true,
        monto: true,
        saldo: true,
        estado: true,
      },
    }),
    prisma.expensa.findMany({
      where: {
        liquidacion: { consorcioId: liquidacion.consorcioId },
        estado: { in: ["PENDIENTE", "PARCIAL"] },
      },
      select: { unidadId: true },
    }),
    prisma.pago.findMany({
      where: {
        expensa: {
          liquidacion: {
            consorcioId: liquidacion.consorcioId,
            periodo: { in: periodoVariants },
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

  const gastosCount = gastos.length;
  const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0);

  const cobranzasCount = cobranzasPeriodo.length;
  const totalCobrado = cobranzasPeriodo.reduce((acc, c) => acc + c.monto, 0);

  const totalLiquidado = expensasLiquidacion.reduce((acc, e) => acc + e.monto, 0);
  const totalPendiente = expensasLiquidacion.reduce((acc, e) => acc + e.saldo, 0);

  const caja = cobranzasPeriodo
    .filter((c) => c.medioPago === "EFECTIVO")
    .reduce((acc, c) => acc + c.monto, 0);
  const cuentaBancaria = cobranzasPeriodo
    .filter((c) => c.medioPago === "TRANSFERENCIA" || c.medioPago === "DEBITO" || c.medioPago === "CREDITO")
    .reduce((acc, c) => acc + c.monto, 0);
  const cheques = cobranzasPeriodo.filter((c) => c.medioPago === "CHEQUE").reduce((acc, c) => acc + c.monto, 0);
  const otrosFondos = cobranzasPeriodo.filter((c) => c.medioPago === "OTRO").reduce((acc, c) => acc + c.monto, 0);
  const totalSaldos = caja + cuentaBancaria + cheques + otrosFondos;

  const sueldosCount = sueldos.length;
  const sueldosMonto = sueldos.reduce((acc, s) => acc + s.monto, 0);

  const unidadesConDeuda = new Set(deudasExpensas.map((d) => d.unidadId)).size;

  async function guardarCambios() {
    "use server";

    const liquidacionActual = await prisma.liquidacion.findUnique({
      where: { id: liquidacion.id },
      select: { id: true, consorcioId: true, periodo: true },
    });

    if (!liquidacionActual) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(liquidacionActual.consorcioId, ["ADMIN", "OPERADOR"]);

    const total =
      (
        await prisma.gasto.aggregate({
          where: {
            consorcioId: liquidacionActual.consorcioId,
            periodo: { in: getPeriodoVariants(liquidacionActual.periodo) },
          },
          _sum: { monto: true },
        })
      )._sum.monto ?? 0;

    await prisma.liquidacion.update({
      where: { id: liquidacionActual.id },
      data: { total },
    });

    redirect(`/liquidaciones/${liquidacionActual.id}/editar?ok=guardado`);
  }

  async function emitirLiquidacion() {
    "use server";

    const liquidacionActual = await prisma.liquidacion.findUnique({
      where: { id: liquidacion.id },
      select: { id: true, consorcioId: true, estado: true },
    });

    if (!liquidacionActual) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(liquidacionActual.consorcioId, ["ADMIN"]);

    if (liquidacionActual.estado !== "BORRADOR") {
      redirect(`/liquidaciones/${liquidacion.id}/editar?error=estado_invalido_emitir`);
    }

    const expensasCount = await prisma.expensa.count({ where: { liquidacionId: liquidacionActual.id } });
    if (expensasCount === 0) {
      redirect(`/liquidaciones/${liquidacion.id}/editar?error=sin_expensas`);
    }

    await prisma.liquidacion.update({
      where: { id: liquidacionActual.id },
      data: { estado: "EMITIDA" },
    });

    redirect(`/liquidaciones/${liquidacionActual.id}/editar?ok=emitida`);
  }

  async function cerrarLiquidacion() {
    "use server";

    const liquidacionActual = await prisma.liquidacion.findUnique({
      where: { id: liquidacion.id },
      select: { id: true, consorcioId: true, estado: true },
    });

    if (!liquidacionActual) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(liquidacionActual.consorcioId, ["ADMIN"]);

    if (liquidacionActual.estado !== "EMITIDA") {
      redirect(`/liquidaciones/${liquidacion.id}/editar?error=estado_invalido_cerrar`);
    }

    await prisma.liquidacion.update({
      where: { id: liquidacionActual.id },
      data: { estado: "CERRADA" },
    });

    redirect(`/liquidaciones/${liquidacionActual.id}/editar?ok=cerrada`);
  }

  const message =
    searchParams?.error === "sin_expensas"
      ? "No se puede emitir una liquidacion sin expensas generadas."
      : searchParams?.error === "estado_invalido_emitir"
        ? "Solo se puede emitir cuando la liquidacion esta en BORRADOR."
        : searchParams?.error === "estado_invalido_cerrar"
          ? "Solo se puede cerrar cuando la liquidacion esta en EMITIDA."
          : searchParams?.ok === "guardado"
            ? "Resumen actualizado correctamente."
            : searchParams?.ok === "emitida"
              ? "Liquidacion emitida correctamente."
              : searchParams?.ok === "cerrada"
                ? "Liquidacion cerrada correctamente."
                : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href={`/liquidaciones/${liquidacion.id}`} className="text-blue-600 hover:underline">
            Volver
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Editar liquidacion {liquidacion.periodo}</h1>
          <p className="mt-1 text-sm text-slate-600">Consorcio: {liquidacion.consorcio.nombre}</p>
          <p className="text-sm text-slate-500">Estado actual: {liquidacion.estado}</p>
        </div>
      </header>

      {message ? (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Cobranzas registradas</h2>
          <p className="mt-2 text-sm text-slate-600">Periodo {liquidacion.periodo}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Cantidad</p>
              <p className="text-2xl font-semibold">{cobranzasCount}</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Monto total cobrado</p>
              <p className="text-2xl font-semibold">{formatCurrency(totalCobrado)}</p>
            </div>
          </div>
          <Link href={`/expensas?consorcioId=${liquidacion.consorcioId}&periodo=${liquidacion.periodo}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Gestion de cobranzas
          </Link>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Gastos del periodo</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Cantidad</p>
              <p className="text-2xl font-semibold">{gastosCount}</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Monto total</p>
              <p className="text-2xl font-semibold">{formatCurrency(totalGastos)}</p>
            </div>
          </div>
          <Link href={`/gastos?consorcioId=${liquidacion.consorcioId}&periodo=${liquidacion.periodo}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Gestion de gastos
          </Link>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Pagos del periodo</h2>
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Sin datos disponibles en esta version. Este bloque queda preparado para egresos reales del consorcio.
          </div>
          <button type="button" disabled className="mt-4 rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500">
            Registrar pagos
          </button>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Saldos al cierre</h2>
          <p className="mt-2 text-sm text-slate-600">Estimado segun cobranzas del periodo</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Caja</span><span className="font-medium">{formatCurrency(caja)}</span></div>
            <div className="flex items-center justify-between"><span>Cuenta bancaria principal</span><span className="font-medium">{formatCurrency(cuentaBancaria)}</span></div>
            <div className="flex items-center justify-between"><span>Cheques de terceros</span><span className="font-medium">{formatCurrency(cheques)}</span></div>
            <div className="flex items-center justify-between"><span>Otros fondos</span><span className="font-medium">{formatCurrency(otrosFondos)}</span></div>
            <div className="border-t border-slate-200 pt-2 flex items-center justify-between font-semibold"><span>Total</span><span>{formatCurrency(totalSaldos)}</span></div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Cobranzas no identificadas</h2>
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Sin datos disponibles por el momento.
          </div>
          <button type="button" disabled className="mt-4 rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500">
            Cobranzas no identificadas
          </button>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Sueldos del personal</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Registros de sueldo</p>
              <p className="text-2xl font-semibold">{sueldosCount}</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Monto registrado</p>
              <p className="text-2xl font-semibold">{formatCurrency(sueldosMonto)}</p>
            </div>
          </div>
          <Link href={`/gastos/nuevo?consorcioId=${liquidacion.consorcioId}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Cargar sueldos
          </Link>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Resumen operativo de la liquidacion</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-100 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total liquidado</p>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(totalLiquidado)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Pendiente de cobro</p>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(totalPendiente)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Unidades con deuda</p>
              <p className="mt-2 text-2xl font-semibold">{unidadesConDeuda}</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Expensas generadas</p>
              <p className="mt-2 text-2xl font-semibold">{expensasLiquidacion.length}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-3">
        <Link href={`/liquidaciones/${liquidacion.id}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancelar
        </Link>

        <form action={guardarCambios}>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Guardar cambios
          </button>
        </form>

        <Link href={`/liquidaciones/${liquidacion.id}/wizard/paso-1`} className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
          Continuar al Paso 1
        </Link>

        {liquidacion.estado === "BORRADOR" && canAdmin ? (
          <form action={emitirLiquidacion}>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Emitir
            </button>
          </form>
        ) : null}

        {liquidacion.estado === "EMITIDA" && canAdmin ? (
          <form action={cerrarLiquidacion}>
            <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Cerrar
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

