import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, requireConsorcioRole } from "../../../../lib/auth";
import {
  CobranzaError,
  estimatePagoExpensa,
  getExpensaCobranzaSnapshot,
  registrarPagoExpensa,
} from "../../../../lib/cobranzas-expensas";
import {
  comprobantePagoValidationMessages,
  isFileProvided,
  saveComprobantePagoFile,
} from "../../../../lib/comprobantes-pago";
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

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildReturnQuery(values: {
  fechaPago?: string;
  monto?: string;
  medioPago?: string;
  referencia?: string;
  nota?: string;
  error?: string;
}) {
  const params = new URLSearchParams();

  if (values.fechaPago) params.set("fechaPago", values.fechaPago);
  if (values.monto) params.set("monto", values.monto);
  if (values.medioPago) params.set("medioPago", values.medioPago);
  if (values.referencia) params.set("referencia", values.referencia);
  if (values.nota) params.set("nota", values.nota);
  if (values.error) params.set("error", values.error);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function RegistrarPagoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    error?: string;
    fechaPago?: string;
    monto?: string;
    medioPago?: string;
    referencia?: string;
    nota?: string;
  };
}) {
  const id = Number(params.id);

  const expensa = await prisma.expensa.findUnique({
    where: { id },
    include: {
      liquidacion: {
        include: {
          consorcio: { select: { id: true, nombre: true } },
        },
      },
      unidad: {
        select: { identificador: true, tipo: true },
      },
    },
  });

  if (!expensa) {
    return <div className="p-6">Expensa no encontrada</div>;
  }

  await requireConsorcioRole(expensa.liquidacion.consorcioId, ["ADMIN"]);

  const authUser = await requireAuth();
  const defaultFechaPago = searchParams?.fechaPago?.trim() || toDateInput(new Date());
  const defaultMonto = searchParams?.monto?.trim() ?? "";
  const defaultMedioPago = searchParams?.medioPago?.trim() || "TRANSFERENCIA";
  const defaultReferencia = searchParams?.referencia?.trim() ?? "";
  const defaultNota = searchParams?.nota?.trim() ?? "";

  const fechaPreview = parseDateInput(defaultFechaPago) ?? new Date();
  const snapshot = await getExpensaCobranzaSnapshot(expensa.id, fechaPreview);

  if (!snapshot) {
    return <div className="p-6">Expensa no encontrada</div>;
  }

  const montoPreview = defaultMonto ? Number(defaultMonto) : null;
  const previewError = defaultMonto && (montoPreview === null || Number.isNaN(montoPreview) || montoPreview <= 0) ? "monto_invalido" : null;
  const estimacion = !previewError && montoPreview !== null
    ? (() => {
        try {
          return estimatePagoExpensa(snapshot, montoPreview);
        } catch (error) {
          if (error instanceof CobranzaError) {
            return error.code;
          }
          throw error;
        }
      })()
    : null;

  async function registrarPago(formData: FormData) {
    "use server";

    const expensaId = Number(formData.get("expensaId"));
    const fechaPagoRaw = (formData.get("fechaPago")?.toString() ?? "").trim();
    const montoRaw = (formData.get("monto")?.toString() ?? "").trim();
    const medioPago = (formData.get("medioPago")?.toString() ?? "").trim() || "TRANSFERENCIA";
    const referencia = (formData.get("referencia")?.toString() ?? "").trim();
    const nota = (formData.get("nota")?.toString() ?? "").trim();
    const comprobante = formData.get("comprobante");

    const currentExpensa = await prisma.expensa.findUnique({
      where: { id: expensaId },
      include: {
        liquidacion: {
          select: { consorcioId: true },
        },
      },
    });

    if (!currentExpensa) {
      redirect("/expensas");
    }

    const actor = await requireAuth();
    await requireConsorcioRole(currentExpensa.liquidacion.consorcioId, ["ADMIN"]);

    const fechaPago = parseDateInput(fechaPagoRaw);
    if (!fechaPago) {
      redirect(`/expensas/${expensaId}/pago${buildReturnQuery({ fechaPago: fechaPagoRaw, monto: montoRaw, medioPago, referencia, nota, error: "fecha_requerida" })}`);
    }

    const monto = Number(montoRaw);
    if (!montoRaw || Number.isNaN(monto) || monto <= 0) {
      redirect(`/expensas/${expensaId}/pago${buildReturnQuery({ fechaPago: fechaPagoRaw, monto: montoRaw, medioPago, referencia, nota, error: "monto_invalido" })}`);
    }

    let comprobanteData: NonNullable<Parameters<typeof registrarPagoExpensa>[0]["comprobante"]> | null = null;

    if (isFileProvided(comprobante)) {
      const saved = await saveComprobantePagoFile(comprobante);
      if (!saved.ok) {
        redirect(`/expensas/${expensaId}/pago${buildReturnQuery({ fechaPago: fechaPagoRaw, monto: montoRaw, medioPago, referencia, nota, error: saved.code })}`);
      }
      comprobanteData = saved.data;
    }

    try {
      await registrarPagoExpensa({
        expensaId,
        fechaPago,
        monto,
        medioPago,
        referencia: referencia || null,
        nota: nota || null,
        registradoPorUserId: actor.id,
        comprobante: comprobanteData,
      });
    } catch (error) {
      if (error instanceof CobranzaError) {
        redirect(`/expensas/${expensaId}/pago${buildReturnQuery({ fechaPago: fechaPagoRaw, monto: montoRaw, medioPago, referencia, nota, error: error.code })}`);
      }

      throw error;
    }

    redirect(`/expensas/${expensaId}`);
  }

  const errorCode = searchParams?.error ?? (typeof estimacion === "string" ? estimacion : previewError);
  const errorMessage =
    errorCode === "fecha_requerida"
      ? "La fecha de pago es obligatoria."
      : errorCode === "monto_invalido"
        ? "El importe a registrar debe ser mayor a 0."
        : errorCode === "expensa_pagada"
          ? "La expensa ya no tiene deuda pendiente para cobrar."
          : errorCode === "monto_excede_total_adeudado"
            ? "El importe no puede superar el total adeudado al momento del pago."
            : errorCode === "fecha_anterior_a_pago_existente"
              ? "La fecha de pago no puede ser anterior a una cobranza ya registrada para esta expensa."
              : errorCode === "invalid_type"
              ? comprobantePagoValidationMessages.invalid_type
              : errorCode === "max_size"
                ? comprobantePagoValidationMessages.max_size
                : errorCode === "write_error"
                  ? comprobantePagoValidationMessages.write_error
                  : null;

  const currentSummary = [
    { label: "Capital original", value: formatCurrency(snapshot.capitalOriginal) },
    { label: "Capital pendiente", value: formatCurrency(snapshot.capitalPendiente) },
    { label: "Interes acumulado al dia", value: formatCurrency(snapshot.interesPendiente) },
    { label: "Total adeudado", value: formatCurrency(snapshot.totalAdeudado) },
    { label: "Total pagado historico", value: formatCurrency(snapshot.totalPagado) },
    { label: "Estado actual", value: snapshot.estado },
  ];

  const previewSummary = estimacion && typeof estimacion === "object"
    ? [
        { label: "Importe a registrar", value: formatCurrency(estimacion.monto) },
        { label: "Imputado a interes", value: formatCurrency(estimacion.montoInteres) },
        { label: "Imputado a capital", value: formatCurrency(estimacion.montoCapital) },
        { label: "Saldo resultante estimado", value: formatCurrency(estimacion.saldoResultante) },
        { label: "Estado estimado", value: estimacion.estadoResultante },
      ]
    : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/expensas/${expensa.id}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Registrar cobranza</h1>
        <p className="text-sm text-slate-600">El pago se imputa primero a intereses y luego a capital.</p>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Datos de la expensa</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-slate-700">
              <p><span className="font-medium">Consorcio:</span> {snapshot.consorcio.nombre}</p>
              <p><span className="font-medium">Liquidacion:</span> {snapshot.liquidacion.periodo}</p>
              <p><span className="font-medium">Unidad:</span> {snapshot.unidad.identificador} ({snapshot.unidad.tipo})</p>
              <p><span className="font-medium">Fecha de calculo:</span> {fechaPreview.toLocaleDateString()}</p>
            </div>
          </div>

          <form method="GET" className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Vista previa del cobro</h2>
            <p className="mt-1 text-sm text-slate-500">Actualiza fecha e importe para estimar intereses, imputacion y saldo resultante antes de guardar.</p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="preview-fechaPago" className="text-sm font-medium text-slate-700">Fecha de pago</label>
                <input id="preview-fechaPago" name="fechaPago" type="date" defaultValue={defaultFechaPago} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
              </div>
              <div className="space-y-1">
                <label htmlFor="preview-monto" className="text-sm font-medium text-slate-700">Importe a registrar</label>
                <input id="preview-monto" name="monto" type="number" step="0.01" min="0.01" defaultValue={defaultMonto} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
              </div>
            </div>

            <input type="hidden" name="medioPago" value={defaultMedioPago} />
            <input type="hidden" name="referencia" value={defaultReferencia} />
            <input type="hidden" name="nota" value={defaultNota} />

            <button type="submit" className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Actualizar resumen
            </button>
          </form>

          <form action={registrarPago} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" encType="multipart/form-data">
            <input type="hidden" name="expensaId" value={expensa.id} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="fechaPago" className="text-sm font-medium text-slate-700">Fecha de pago</label>
                <input id="fechaPago" name="fechaPago" type="date" defaultValue={defaultFechaPago} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
              </div>
              <div className="space-y-1">
                <label htmlFor="monto" className="text-sm font-medium text-slate-700">Importe a registrar</label>
                <input id="monto" name="monto" type="number" step="0.01" min="0.01" defaultValue={defaultMonto} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="medioPago" className="text-sm font-medium text-slate-700">Medio de pago</label>
              <select id="medioPago" name="medioPago" defaultValue={defaultMedioPago} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="DEBITO">DEBITO</option>
                <option value="CREDITO">CREDITO</option>
                <option value="CHEQUE">CHEQUE</option>
                <option value="OTRO">OTRO</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="referencia" className="text-sm font-medium text-slate-700">Referencia / nro. de operacion</label>
                <input id="referencia" name="referencia" defaultValue={defaultReferencia} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
              </div>
              <div className="space-y-1">
                <label htmlFor="comprobante" className="text-sm font-medium text-slate-700">Comprobante (opcional)</label>
                <input id="comprobante" name="comprobante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700" />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="nota" className="text-sm font-medium text-slate-700">Observaciones</label>
              <textarea id="nota" name="nota" rows={3} defaultValue={defaultNota} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
            </div>

            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              El pago quedara validado automaticamente porque lo registra {authUser.role === "SUPER_ADMIN" ? "un super admin" : "un administrador del consorcio"}.
            </div>

            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Guardar cobranza
            </button>
          </form>
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Resumen al dia</h2>
            <div className="mt-4 space-y-3 text-sm">
              {currentSummary.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="font-medium text-slate-900 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Resultado estimado</h2>
            <div className="mt-4 space-y-3 text-sm">
              {previewSummary ? (
                previewSummary.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                    <span className="text-slate-600">{item.label}</span>
                    <span className="font-medium text-slate-900 text-right">{item.value}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">Ingresa fecha e importe y usa “Actualizar resumen” para ver la imputacion estimada antes de guardar.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
