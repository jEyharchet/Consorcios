import { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getActiveConsorcioContext } from "../../../lib/consorcio-activo";
import { requireConsorcioRole } from "../../../lib/auth";
import { getCurrentPeriodo, getPeriodoVariants, normalizePeriodo } from "../../../lib/periodo";
import { prisma } from "../../../lib/prisma";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function NuevaLiquidacionPage({
  searchParams,
}: {
  searchParams?: { error?: string; periodo?: string };
}) {
  const { access, consorcios, activeConsorcioId } = await getActiveConsorcioContext();

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Nueva liquidacion</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo valido.
        </p>
      </main>
    );
  }

  if (!access.isSuperAdmin && !access.allowedConsorcioIds.includes(activeConsorcioId)) {
    redirect("/liquidaciones");
  }

  const assignmentRole = access.isSuperAdmin
    ? "ADMIN"
    : access.assignments.find((a) => a.consorcioId === activeConsorcioId)?.role;

  const canOperate = access.isSuperAdmin || assignmentRole === "ADMIN" || assignmentRole === "OPERADOR";

  if (!canOperate) {
    redirect("/liquidaciones");
  }

  const consorcioActivo = consorcios.find((c) => c.id === activeConsorcioId);

  const normalizedPeriodo = normalizePeriodo(searchParams?.periodo ?? "") ?? getCurrentPeriodo();
  const periodoVariants = getPeriodoVariants(normalizedPeriodo);

  const ultimaLiquidacion = await prisma.liquidacion.findFirst({
    where: { consorcioId: activeConsorcioId },
    orderBy: [{ fechaEmision: "desc" }, { id: "desc" }],
    select: { id: true, periodo: true, fechaEmision: true, estado: true },
  });

  const [gastos, sueldos, expensasPeriodo, cobranzasPeriodo] = await Promise.all([
    prisma.gasto.findMany({
      where: {
        consorcioId: activeConsorcioId,
        periodo: { in: periodoVariants },
      },
      select: {
        id: true,
        concepto: true,
        rubroExpensa: true,
        monto: true,
      },
    }),
    prisma.gasto.findMany({
      where: {
        consorcioId: activeConsorcioId,
        periodo: { in: periodoVariants },
        rubroExpensa: { contains: "Sueldos" },
      },
      select: { id: true, monto: true },
    }),
    prisma.expensa.findMany({
      where: {
        liquidacion: {
          consorcioId: activeConsorcioId,
          periodo: { in: periodoVariants },
        },
      },
      select: {
        id: true,
        unidadId: true,
        monto: true,
        saldo: true,
        estado: true,
      },
    }),
    prisma.pago.findMany({
      where: {
        expensa: {
          liquidacion: {
            consorcioId: activeConsorcioId,
            periodo: { in: periodoVariants },
          },
        },
      },
      select: { id: true, monto: true, medioPago: true },
    }),
  ]);

  const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0);
  const totalCobrado = cobranzasPeriodo.reduce((acc, c) => acc + c.monto, 0);
  const cobranzasCount = cobranzasPeriodo.length;

  const totalLiquidado = expensasPeriodo.reduce((acc, e) => acc + e.monto, 0);
  const totalPendiente = expensasPeriodo.reduce((acc, e) => acc + e.saldo, 0);

  const caja = cobranzasPeriodo
    .filter((c) => c.medioPago === "EFECTIVO")
    .reduce((acc, c) => acc + c.monto, 0);
  const cuentaBancaria = cobranzasPeriodo
    .filter((c) => c.medioPago === "TRANSFERENCIA" || c.medioPago === "DEBITO" || c.medioPago === "CREDITO")
    .reduce((acc, c) => acc + c.monto, 0);
  const cheques = cobranzasPeriodo.filter((c) => c.medioPago === "CHEQUE").reduce((acc, c) => acc + c.monto, 0);
  const otrosFondos = cobranzasPeriodo.filter((c) => c.medioPago === "OTRO").reduce((acc, c) => acc + c.monto, 0);
  const totalSaldos = caja + cuentaBancaria + cheques + otrosFondos;

  const gastosSueldosTotal = sueldos.reduce((acc, s) => acc + s.monto, 0);

  async function iniciarLiquidacion(formData: FormData) {
    "use server";

    const periodoRaw = (formData.get("periodo")?.toString() ?? "").trim();
    const periodo = normalizePeriodo(periodoRaw);

    if (!periodo) {
      redirect("/liquidaciones/nuevo?error=periodo_invalido");
    }

    await requireConsorcioRole(activeConsorcioId, ["ADMIN", "OPERADOR"]);

    const total =
      (
        await prisma.gasto.aggregate({
          where: {
            consorcioId: activeConsorcioId,
            periodo: { in: getPeriodoVariants(periodo) },
          },
          _sum: { monto: true },
        })
      )._sum.monto ?? 0;

    try {
      const liquidacion = await prisma.liquidacion.create({
        data: {
          consorcioId: activeConsorcioId,
          periodo,
          total,
          estado: "BORRADOR",
        },
      });

      redirect(`/liquidaciones/${liquidacion.id}/wizard/paso-1`);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect(`/liquidaciones/nuevo?periodo=${encodeURIComponent(periodo)}&error=duplicada`);
      }

      throw error;
    }
  }

  const errorMessage =
    searchParams?.error === "periodo_invalido"
      ? "El periodo debe tener formato YYYY-MM."
      : searchParams?.error === "duplicada"
        ? "Ya existe una liquidacion para ese consorcio y periodo."
        : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/liquidaciones" className="text-blue-600 hover:underline">
            Volver
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Preparar liquidacion</h1>
          <p className="mt-1 text-sm text-slate-600">
            Consorcio activo: <span className="font-medium">{consorcioActivo?.nombre ?? `#${activeConsorcioId}`}</span>
          </p>
          <p className="text-sm text-slate-500">
            {ultimaLiquidacion
              ? `Ultima liquidacion: ${ultimaLiquidacion.periodo} (${ultimaLiquidacion.estado})`
              : "Aun no hay liquidaciones previas en este consorcio."}
          </p>
        </div>

        <form method="GET" className="rounded-lg border border-slate-200 bg-white p-3">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Periodo de trabajo</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="month"
              name="periodo"
              defaultValue={normalizedPeriodo}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Actualizar
            </button>
          </div>
        </form>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Cobranzas registradas</h2>
          <p className="mt-2 text-sm text-slate-600">Periodo {normalizedPeriodo}</p>
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
          <Link href={`/expensas?consorcioId=${activeConsorcioId}&periodo=${normalizedPeriodo}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Gestion de cobranzas
          </Link>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Gastos del periodo</h2>
          <p className="mt-2 text-sm text-slate-600">Periodo {normalizedPeriodo}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Cantidad</p>
              <p className="text-2xl font-semibold">{gastos.length}</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Monto total</p>
              <p className="text-2xl font-semibold">{formatCurrency(totalGastos)}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">Incluye todos los gastos cargados del periodo seleccionado.</p>
          <Link href={`/gastos?consorcioId=${activeConsorcioId}&periodo=${normalizedPeriodo}`} className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            Gestion de gastos
          </Link>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Pagos del periodo</h2>
          <p className="mt-2 text-sm text-slate-600">Egresos reales del consorcio</p>
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Sin datos disponibles en esta version. El modulo de pagos de gastos se incorporara en la siguiente etapa.
          </div>
          <button type="button" disabled className="mt-4 rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500">
            Registrar pagos
          </button>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Saldos disponibles</h2>
          <p className="mt-2 text-sm text-slate-600">Estimado segun cobranzas registradas</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Caja</span><span className="font-medium">{formatCurrency(caja)}</span></div>
            <div className="flex items-center justify-between"><span>Cuenta bancaria principal</span><span className="font-medium">{formatCurrency(cuentaBancaria)}</span></div>
            <div className="flex items-center justify-between"><span>Cheques de terceros</span><span className="font-medium">{formatCurrency(cheques)}</span></div>
            <div className="flex items-center justify-between"><span>Otros fondos</span><span className="font-medium">{formatCurrency(otrosFondos)}</span></div>
            <div className="border-t border-slate-200 pt-2 flex items-center justify-between font-semibold"><span>Total</span><span>{formatCurrency(totalSaldos)}</span></div>
          </div>
          <button type="button" disabled className="mt-4 rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500">
            Movimientos y saldos
          </button>
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
              <p className="text-2xl font-semibold">{sueldos.length}</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Monto registrado</p>
              <p className="text-2xl font-semibold">{formatCurrency(gastosSueldosTotal)}</p>
            </div>
          </div>
          <Link href={`/gastos/nuevo?consorcioId=${activeConsorcioId}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Cargar sueldos
          </Link>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Fondo de reserva</h2>
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Sin datos disponibles. Este bloque queda preparado para integrar movimientos y saldo acumulado de fondo de reserva.
          </div>
        </article>
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/liquidaciones" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancelar
        </Link>
        <Link href={`/liquidaciones/wizard/paso-1?periodo=${normalizedPeriodo}`} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Iniciar liquidacion
        </Link>
        <Link href={`/gastos?consorcioId=${activeConsorcioId}&periodo=${normalizedPeriodo}`} className="text-sm text-blue-600 hover:underline">
          Revisar gastos antes de iniciar
        </Link>
      </section>

      <p className="mt-4 text-xs text-slate-500">
        Al iniciar, ingresas al Paso 1 del wizard para confirmar montos antes de crear/actualizar la liquidacion.
      </p>
    </main>
  );
}


