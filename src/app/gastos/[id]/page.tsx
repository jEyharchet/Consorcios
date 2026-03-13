import Link from "next/link";

import { getAccessContext, requireConsorcioAccess } from "../../../lib/auth";
import { buildGastoPagoSummary } from "../../../lib/pagos-gastos";
import { prisma } from "../../../lib/prisma";
import { getPeriodoVariants } from "../../../lib/periodo";
import { formatDateAR } from "../../../lib/relaciones";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function GastoDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);

  const gasto = await prisma.gasto.findUnique({
    where: { id },
    include: {
      consorcio: { select: { nombre: true } },
      proveedor: { select: { nombre: true } },
      liquidacion: { select: { id: true, periodo: true, estado: true } },
      pagosGasto: {
        orderBy: [{ fechaPago: "desc" }, { id: "desc" }],
        include: {
          consorcioCuentaBancaria: {
            select: {
              banco: true,
              alias: true,
              cbu: true,
            },
          },
        },
      },
    },
  });

  if (!gasto) {
    return <div className="p-6">Gasto no encontrado</div>;
  }

  await requireConsorcioAccess(gasto.consorcioId);
  const access = await getAccessContext();
  const userAssignment = access.assignments.find((assignment) => assignment.consorcioId === gasto.consorcioId);
  const canEditByRole = access.isSuperAdmin || userAssignment?.role === "ADMIN" || userAssignment?.role === "OPERADOR";

  const liquidacionBloqueante = await prisma.liquidacion.findFirst({
    where: {
      consorcioId: gasto.consorcioId,
      periodo: { in: getPeriodoVariants(gasto.periodo) },
      estado: { in: ["EMITIDA", "CERRADA"] },
    },
    select: { id: true },
  });

  const resumenPago = buildGastoPagoSummary({
    montoTotal: gasto.monto,
    pagos: gasto.pagosGasto,
  });

  const bloqueadoPorLiquidacion = Boolean(liquidacionBloqueante);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link href="/gastos" className="text-blue-600 hover:underline">
            Volver
          </Link>
          <h1 className="text-2xl font-semibold">{gasto.concepto}</h1>
        </div>

        {canEditByRole ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/gastos/${gasto.id}/editar`}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Editar
            </Link>
            {resumenPago.saldoPendiente > 0 ? (
              <Link
                href={`/gastos/${gasto.id}/pago`}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Registrar pago
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      {canEditByRole && bloqueadoPorLiquidacion ? (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este gasto no se puede editar porque la liquidacion del periodo esta emitida o cerrada.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Datos del gasto</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              <p><span className="font-medium">Consorcio:</span> {gasto.consorcio.nombre}</p>
              <p><span className="font-medium">Fecha:</span> {formatDateAR(gasto.fecha)}</p>
              <p><span className="font-medium">Periodo:</span> {gasto.periodo}</p>
              <p><span className="font-medium">Proveedor:</span> {gasto.proveedor?.nombre ?? "-"}</p>
              <p><span className="font-medium">Tipo expensa:</span> {gasto.tipoExpensa}</p>
              <p><span className="font-medium">Rubro:</span> {gasto.rubroExpensa}</p>
              <p><span className="font-medium">Monto total:</span> {formatCurrency(gasto.monto)}</p>
              <p><span className="font-medium">Estado de pago:</span> {resumenPago.estado}</p>
              <p className="sm:col-span-2"><span className="font-medium">Descripcion:</span> {gasto.descripcion ?? "-"}</p>
              <p className="sm:col-span-2">
                <span className="font-medium">Liquidacion asociada:</span>{" "}
                {gasto.liquidacion ? `#${gasto.liquidacion.id} (${gasto.liquidacion.periodo})` : "-"}
              </p>
            </div>
          </div>

          <div id="pagos" className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Historial de pagos</h2>
            <div className="mt-4 space-y-3 text-sm">
              {gasto.pagosGasto.length === 0 ? (
                <p className="text-slate-500">Todavia no hay pagos registrados para este gasto.</p>
              ) : (
                gasto.pagosGasto.map((pago) => (
                  <div key={pago.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{formatDateAR(pago.fechaPago)}</p>
                        <p className="mt-1 text-slate-600">{pago.medioPago}</p>
                      </div>
                      <p className="font-medium text-slate-900">{formatCurrency(pago.monto)}</p>
                    </div>
                    <p className="mt-2 text-slate-600">
                      Origen del fondo:{" "}
                      {pago.medioPago === "EFECTIVO"
                        ? "Caja"
                        : pago.consorcioCuentaBancaria
                          ? `${pago.consorcioCuentaBancaria.banco} - ${pago.consorcioCuentaBancaria.alias ?? pago.consorcioCuentaBancaria.cbu}`
                          : "Cuenta bancaria"}
                    </p>
                    <p className="mt-1 text-slate-600">Observacion: {pago.observacion ?? "-"}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Resumen de pago</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <span className="text-slate-600">Monto total</span>
                <span className="font-medium text-slate-900">{formatCurrency(gasto.monto)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <span className="text-slate-600">Total pagado</span>
                <span className="font-medium text-slate-900">{formatCurrency(resumenPago.totalPagado)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">Saldo pendiente</span>
                <span className="font-medium text-slate-900">{formatCurrency(resumenPago.saldoPendiente)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Comprobante</h2>
            <div className="mt-4 text-sm text-slate-600">
              {gasto.comprobantePath ? (
                <a href={gasto.comprobantePath} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  Ver comprobante
                </a>
              ) : (
                <p>Sin comprobante cargado.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
