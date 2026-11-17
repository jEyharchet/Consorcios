import Link from "next/link";
import { redirect } from "next/navigation";

import PagoGastoFields from "../../../../_components/PagoGastoFields";
import { requireConsorcioRole } from "../../../../../../lib/auth";
import { isMedioPagoExpensa, type MedioPagoExpensa } from "../../../../../../lib/fondos";
import { buildGastoPagoSummary, editarPagoGasto, PagoGastoError } from "../../../../../../lib/pagos-gastos";
import { prisma } from "../../../../../../lib/prisma";

function toDateInput(date: Date) {
  // Las fechas se guardan a las 00:00Z (Vercel) o 03:00Z (local): el día UTC es el cargado.
  return date.toISOString().slice(0, 10);
}

function parseDateInput(raw: string | null | undefined) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return null;
  }
  const parsed = new Date(`${raw.trim()}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(value);
}

const MENSAJES_ERROR: Record<string, string> = {
  fecha_requerida: "La fecha de pago es obligatoria.",
  monto_invalido: "El monto debe ser mayor a 0.",
  monto_excede_saldo_pendiente: "Con este importe, los pagos superarían el monto del gasto.",
  saldo_insuficiente: "Con este cambio, la caja o la cuenta quedaría con saldo negativo en algún movimiento.",
  cuenta_bancaria_requerida: "Seleccioná una cuenta bancaria activa del consorcio.",
  medio_pago_invalido: "El medio de pago seleccionado no es válido.",
  pago_inexistente: "El pago indicado no existe.",
  ejercicio_cerrado: "El pago cae en un ejercicio cerrado: no se puede modificar.",
};

export default async function EditarPagoGastoPage({
  params,
  searchParams,
}: {
  params: { id: string; pagoId: string };
  searchParams?: { error?: string };
}) {
  const gastoId = Number(params.id);
  const pagoId = Number(params.pagoId);

  const pago = await prisma.pagoGasto.findUnique({
    where: { id: pagoId },
    include: {
      movimientoFondo: { select: { id: true } },
      gasto: {
        select: {
          id: true,
          concepto: true,
          periodo: true,
          monto: true,
          consorcioId: true,
          proveedor: { select: { nombre: true } },
          pagosGasto: { select: { id: true, monto: true } },
        },
      },
    },
  });

  if (!pago || pago.gastoId !== gastoId) {
    return <div className="p-6">Pago no encontrado</div>;
  }

  await requireConsorcioRole(pago.consorcioId, ["ADMIN", "OPERADOR"]);

  // Cuentas activas más la del pago (aunque esté inactiva).
  const cuentas = await prisma.consorcioCuentaBancaria.findMany({
    where: {
      consorcioId: pago.consorcioId,
      OR: [{ activa: true }, ...(pago.consorcioCuentaBancariaId ? [{ id: pago.consorcioCuentaBancariaId }] : [])],
    },
    orderBy: [{ esCuentaExpensas: "desc" }, { banco: "asc" }, { id: "asc" }],
    select: { id: true, banco: true, tipoCuenta: true, titular: true, numeroCuenta: true, cbu: true, alias: true, saldoActual: true },
  });

  const otrosPagos = pago.gasto.pagosGasto.filter((p) => p.id !== pago.id);
  const maximo = buildGastoPagoSummary({ montoTotal: pago.gasto.monto, pagos: otrosPagos }).saldoPendiente;
  const medioActual: MedioPagoExpensa = isMedioPagoExpensa(pago.medioPago) ? pago.medioPago : "TRANSFERENCIA";

  async function guardarAction(formData: FormData) {
    "use server";

    const actual = await prisma.pagoGasto.findUnique({ where: { id: pagoId }, select: { consorcioId: true, gastoId: true } });
    if (!actual || actual.gastoId !== gastoId) {
      redirect(`/gastos/${gastoId}`);
    }
    await requireConsorcioRole(actual.consorcioId, ["ADMIN", "OPERADOR"]);

    const volver = (error: string) => redirect(`/gastos/${gastoId}/pagos/${pagoId}/editar?error=${error}`);

    const fechaPago = parseDateInput(formData.get("fechaPago")?.toString());
    if (!fechaPago) volver("fecha_requerida");

    const montoRaw = (formData.get("monto")?.toString() ?? "").trim();
    const monto = Number(montoRaw);
    if (!montoRaw || Number.isNaN(monto) || monto <= 0) volver("monto_invalido");

    const cuentaRaw = (formData.get("consorcioCuentaBancariaId")?.toString() ?? "").trim();

    try {
      await editarPagoGasto({
        pagoGastoId: pagoId,
        consorcioId: actual.consorcioId,
        fechaPago: fechaPago!,
        monto,
        medioPago: (formData.get("medioPago")?.toString() ?? "").trim(),
        consorcioCuentaBancariaId: /^\d+$/.test(cuentaRaw) ? Number(cuentaRaw) : null,
        observacion: formData.get("observacion")?.toString() ?? null,
      });
    } catch (error) {
      if (error instanceof PagoGastoError) volver(error.code);
      throw error;
    }

    redirect(`/gastos/${gastoId}#pagos`);
  }

  const errorMessage = searchParams?.error ? MENSAJES_ERROR[searchParams.error] ?? "No se pudo guardar el pago." : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/gastos/${gastoId}#pagos`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Editar pago de gasto</h1>
        <p className="text-sm text-slate-600">
          {pago.gasto.concepto} · {pago.gasto.periodo}
          {pago.gasto.proveedor ? ` · ${pago.gasto.proveedor.nombre}` : ""} · Monto del gasto {formatCurrency(pago.gasto.monto)}
        </p>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {pago.movimientoFondo
          ? "Al guardar se corrige Tesorería: si cambia el importe, se ajustan el saldo de la caja o cuenta y los saldos de los movimientos cargados después; si cambia la caja o la cuenta, el movimiento pasa a la nueva. Cambiar solo la fecha no modifica saldos."
          : "Este pago no tiene movimiento de Tesorería asociado: se corrigen solo los datos del pago, sin tocar saldos."}
      </div>

      <form action={guardarAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="fechaPago" className="text-sm font-medium text-slate-700">Fecha de pago</label>
            <input
              id="fechaPago"
              name="fechaPago"
              type="date"
              defaultValue={toDateInput(pago.fechaPago)}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="monto" className="text-sm font-medium text-slate-700">Monto</label>
            <input
              id="monto"
              name="monto"
              type="number"
              step="0.01"
              min="0.01"
              max={maximo}
              defaultValue={pago.monto}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
            <p className="text-xs text-slate-500">Máximo {formatCurrency(maximo)} (monto del gasto menos los otros pagos).</p>
          </div>
        </div>

        <PagoGastoFields
          cuentasBancarias={cuentas}
          defaultMedioPago={medioActual}
          defaultCuentaBancariaId={pago.consorcioCuentaBancariaId}
        />

        <div className="space-y-1">
          <label htmlFor="observacion" className="text-sm font-medium text-slate-700">Observación</label>
          <textarea
            id="observacion"
            name="observacion"
            rows={3}
            defaultValue={pago.observacion ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Guardar cambios
          </button>
          <Link
            href={`/gastos/${gastoId}#pagos`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </main>
  );
}
