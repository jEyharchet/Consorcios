import Link from "next/link";
import { redirect } from "next/navigation";

import PagoGastoFields from "../../_components/PagoGastoFields";
import { requireConsorcioRole } from "../../../../lib/auth";
import { buildGastoPagoSummary, getGastoPagoEstado, PagoGastoError, registrarPagoGasto } from "../../../../lib/pagos-gastos";
import { isMedioPagoExpensa, type MedioPagoExpensa } from "../../../../lib/fondos";
import { prisma } from "../../../../lib/prisma";

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(raw: string | null | undefined) {
  if (!raw) {
    return null;
  }

  const parsed = new Date(`${raw.trim()}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildReturnQuery(values: Record<string, string | undefined | null>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function PagoGastoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    error?: string;
    fechaPago?: string;
    monto?: string;
    medioPago?: string;
    consorcioCuentaBancariaId?: string;
    observacion?: string;
  };
}) {
  const id = Number(params.id);

  const gasto = await prisma.gasto.findUnique({
    where: { id },
    include: {
      consorcio: {
        select: {
          id: true,
          nombre: true,
        },
      },
      proveedor: {
        select: { nombre: true },
      },
      pagosGasto: {
        orderBy: [{ fechaPago: "desc" }, { id: "desc" }],
        select: {
          id: true,
          monto: true,
          fechaPago: true,
          medioPago: true,
          observacion: true,
        },
      },
    },
  });

  if (!gasto) {
    return <div className="p-6">Gasto no encontrado</div>;
  }

  await requireConsorcioRole(gasto.consorcioId, ["ADMIN", "OPERADOR"]);

  const cuentasBancariasActivas = await prisma.consorcioCuentaBancaria.findMany({
    where: {
      consorcioId: gasto.consorcioId,
      activa: true,
    },
    orderBy: [{ esCuentaExpensas: "desc" }, { banco: "asc" }, { id: "asc" }],
    select: {
      id: true,
      banco: true,
      tipoCuenta: true,
      titular: true,
      numeroCuenta: true,
      cbu: true,
      alias: true,
      saldoActual: true,
    },
  });

  const resumenPago = buildGastoPagoSummary({
    montoTotal: gasto.monto,
    pagos: gasto.pagosGasto,
  });

  const defaultFechaPago = searchParams?.fechaPago?.trim() || toDateInput(new Date());
  const defaultMonto = searchParams?.monto?.trim() ?? "";
  const medioPagoParam = searchParams?.medioPago?.trim() ?? "";
  const defaultMedioPago: MedioPagoExpensa = isMedioPagoExpensa(medioPagoParam) ? medioPagoParam : "TRANSFERENCIA";
  const requestedCuentaId = searchParams?.consorcioCuentaBancariaId?.trim() ?? "";
  const defaultCuentaBancariaId =
    requestedCuentaId && /^\d+$/.test(requestedCuentaId)
      ? Number(requestedCuentaId)
      : cuentasBancariasActivas.length === 1
        ? cuentasBancariasActivas[0].id
        : null;
  const defaultObservacion = searchParams?.observacion?.trim() ?? "";

  async function registrarPagoAction(formData: FormData) {
    "use server";

    const gastoId = Number(formData.get("gastoId"));
    const fechaPagoRaw = (formData.get("fechaPago")?.toString() ?? "").trim();
    const montoRaw = (formData.get("monto")?.toString() ?? "").trim();
    const medioPago = (formData.get("medioPago")?.toString() ?? "").trim() || "TRANSFERENCIA";
    const cuentaIdRaw = (formData.get("consorcioCuentaBancariaId")?.toString() ?? "").trim();
    const observacion = (formData.get("observacion")?.toString() ?? "").trim();

    const currentGasto = await prisma.gasto.findUnique({
      where: { id: gastoId },
      select: {
        id: true,
        consorcioId: true,
      },
    });

    if (!currentGasto) {
      redirect("/gastos");
    }

    await requireConsorcioRole(currentGasto.consorcioId, ["ADMIN", "OPERADOR"]);

    const fechaPago = parseDateInput(fechaPagoRaw);
    if (!fechaPago) {
      redirect(`/gastos/${gastoId}/pago${buildReturnQuery({ error: "fecha_requerida", fechaPago: fechaPagoRaw, monto: montoRaw, medioPago, consorcioCuentaBancariaId: cuentaIdRaw, observacion })}`);
    }

    const monto = Number(montoRaw);
    if (!montoRaw || Number.isNaN(monto) || monto <= 0) {
      redirect(`/gastos/${gastoId}/pago${buildReturnQuery({ error: "monto_invalido", fechaPago: fechaPagoRaw, monto: montoRaw, medioPago, consorcioCuentaBancariaId: cuentaIdRaw, observacion })}`);
    }

    const consorcioCuentaBancariaId =
      cuentaIdRaw && /^\d+$/.test(cuentaIdRaw)
        ? Number(cuentaIdRaw)
        : null;

    try {
      await registrarPagoGasto({
        gastoId,
        fechaPago,
        monto,
        medioPago,
        consorcioCuentaBancariaId,
        observacion: observacion || null,
      });
    } catch (error) {
      if (error instanceof PagoGastoError) {
        redirect(`/gastos/${gastoId}/pago${buildReturnQuery({ error: error.code, fechaPago: fechaPagoRaw, monto: montoRaw, medioPago, consorcioCuentaBancariaId: cuentaIdRaw, observacion })}`);
      }

      throw error;
    }

    redirect(`/gastos/${gastoId}`);
  }

  const errorMessage =
    searchParams?.error === "fecha_requerida"
      ? "La fecha de pago es obligatoria."
      : searchParams?.error === "monto_invalido"
        ? "El monto debe ser mayor a 0."
        : searchParams?.error === "gasto_inexistente"
          ? "El gasto indicado no existe."
          : searchParams?.error === "gasto_pagado_total"
            ? "El gasto ya se encuentra pagado en su totalidad."
            : searchParams?.error === "monto_excede_saldo_pendiente"
              ? "El monto no puede superar el saldo pendiente del gasto."
              : searchParams?.error === "saldo_insuficiente"
                ? "No hay saldo suficiente en la caja o cuenta seleccionada."
                : searchParams?.error === "transferencia_sin_cuentas_activas"
                  ? "No hay cuentas bancarias activas disponibles para registrar una transferencia."
                  : searchParams?.error === "cuenta_bancaria_requerida"
                    ? "Debes seleccionar una cuenta bancaria para registrar la transferencia."
                    : searchParams?.error === "medio_pago_invalido"
                      ? "El medio de pago seleccionado no es valido."
                      : searchParams?.error === "consorcio_inexistente"
                        ? "No se encontro el consorcio asociado al gasto."
                        : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/gastos/${gasto.id}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Registrar pago de gasto</h1>
        <p className="text-sm text-slate-600">El pago descuenta saldo de caja o banco y genera movimiento de Tesoreria.</p>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Datos del gasto</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              <p><span className="font-medium">Consorcio:</span> {gasto.consorcio.nombre}</p>
              <p><span className="font-medium">Proveedor:</span> {gasto.proveedor?.nombre ?? "-"}</p>
              <p><span className="font-medium">Concepto:</span> {gasto.concepto}</p>
              <p><span className="font-medium">Periodo:</span> {gasto.periodo}</p>
              <p><span className="font-medium">Estado:</span> {getGastoPagoEstado({ montoTotal: gasto.monto, totalPagado: resumenPago.totalPagado })}</p>
              <p><span className="font-medium">Monto total:</span> {formatCurrency(gasto.monto)}</p>
            </div>
          </div>

          <form action={registrarPagoAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
            <input type="hidden" name="gastoId" value={gasto.id} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="fechaPago" className="text-sm font-medium text-slate-700">Fecha de pago</label>
                <input id="fechaPago" name="fechaPago" type="date" defaultValue={defaultFechaPago} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
              </div>
              <div className="space-y-1">
                <label htmlFor="monto" className="text-sm font-medium text-slate-700">Monto</label>
                <input id="monto" name="monto" type="number" step="0.01" min="0.01" max={resumenPago.saldoPendiente} defaultValue={defaultMonto} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
              </div>
            </div>

            <PagoGastoFields
              cuentasBancarias={cuentasBancariasActivas}
              defaultMedioPago={defaultMedioPago}
              defaultCuentaBancariaId={defaultCuentaBancariaId}
            />

            <div className="space-y-1">
              <label htmlFor="observacion" className="text-sm font-medium text-slate-700">Observacion</label>
              <textarea id="observacion" name="observacion" rows={3} defaultValue={defaultObservacion} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
            </div>

            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Guardar pago
            </button>
          </form>
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Resumen</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <span className="text-slate-600">Monto total</span>
                <span className="font-medium text-slate-900">{formatCurrency(gasto.monto)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <span className="text-slate-600">Pagado</span>
                <span className="font-medium text-slate-900">{formatCurrency(resumenPago.totalPagado)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">Saldo pendiente</span>
                <span className="font-medium text-slate-900">{formatCurrency(resumenPago.saldoPendiente)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Pagos registrados</h2>
            <div className="mt-4 space-y-3 text-sm">
              {gasto.pagosGasto.length === 0 ? (
                <p className="text-slate-500">Todavia no hay pagos registrados para este gasto.</p>
              ) : (
                gasto.pagosGasto.map((pago) => (
                  <div key={pago.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-900">{formatCurrency(pago.monto)}</span>
                      <span className="text-slate-500">{pago.medioPago}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{pago.observacion ?? "-"}</p>
                    <p className="mt-1 text-xs text-slate-500">{pago.fechaPago.toLocaleDateString("es-AR")}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
