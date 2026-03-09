import Link from "next/link";
import { redirect } from "next/navigation";

import { requireConsorcioRole } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

function resolveEstado(monto: number, totalPagado: number) {
  if (totalPagado <= 0) {
    return "PENDIENTE";
  }

  if (totalPagado < monto) {
    return "PARCIAL";
  }

  return "PAGADA";
}

export default async function RegistrarPagoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
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

  await requireConsorcioRole(expensa.liquidacion.consorcioId, ["ADMIN", "OPERADOR"]);

  async function registrarPago(formData: FormData) {
    "use server";

    const expensaId = Number(formData.get("expensaId"));
    const fechaPagoRaw = (formData.get("fechaPago")?.toString() ?? "").trim();
    const montoRaw = (formData.get("monto")?.toString() ?? "").trim();
    const medioPago = (formData.get("medioPago")?.toString() ?? "").trim() || "TRANSFERENCIA";
    const referencia = (formData.get("referencia")?.toString() ?? "").trim();
    const nota = (formData.get("nota")?.toString() ?? "").trim();

    const expensa = await prisma.expensa.findUnique({
      where: { id: expensaId },
      include: {
        liquidacion: {
          select: { consorcioId: true },
        },
      },
    });

    if (!expensa) {
      redirect("/expensas");
    }

    await requireConsorcioRole(expensa.liquidacion.consorcioId, ["ADMIN", "OPERADOR"]);

    if (!fechaPagoRaw) {
      redirect(`/expensas/${expensaId}/pago?error=fecha_requerida`);
    }

    const fechaPago = new Date(fechaPagoRaw);
    if (Number.isNaN(fechaPago.getTime())) {
      redirect(`/expensas/${expensaId}/pago?error=fecha_requerida`);
    }

    const monto = Number(montoRaw);
    if (!montoRaw || Number.isNaN(monto) || monto <= 0) {
      redirect(`/expensas/${expensaId}/pago?error=monto_invalido`);
    }

    if (expensa.estado === "PAGADA") {
      redirect(`/expensas/${expensaId}/pago?error=expensa_pagada`);
    }

    if (monto > expensa.saldo) {
      redirect(`/expensas/${expensaId}/pago?error=monto_excede_saldo`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.pago.create({
        data: {
          expensaId,
          fechaPago,
          monto,
          medioPago,
          referencia: referencia || null,
          nota: nota || null,
        },
      });

      const pagos = await tx.pago.aggregate({
        where: { expensaId },
        _sum: { monto: true },
      });

      const totalPagado = pagos._sum.monto ?? 0;
      const saldo = Math.max(expensa.monto - totalPagado, 0);
      const estado = resolveEstado(expensa.monto, totalPagado);

      await tx.expensa.update({
        where: { id: expensaId },
        data: {
          saldo,
          estado,
        },
      });
    });

    redirect(`/expensas/${expensaId}`);
  }

  const errorMessage =
    searchParams?.error === "fecha_requerida"
      ? "La fecha de cobranza es obligatoria."
      : searchParams?.error === "monto_invalido"
        ? "El monto debe ser mayor a 0."
        : searchParams?.error === "expensa_pagada"
          ? "La expensa ya esta pagada."
          : searchParams?.error === "monto_excede_saldo"
            ? "El monto no puede superar el saldo pendiente."
            : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/expensas/${expensa.id}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Registrar cobranza</h1>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p><span className="font-medium">Consorcio:</span> {expensa.liquidacion.consorcio.nombre}</p>
        <p><span className="font-medium">Unidad:</span> {expensa.unidad.identificador} ({expensa.unidad.tipo})</p>
        <p><span className="font-medium">Monto:</span> {expensa.monto.toFixed(2)}</p>
        <p><span className="font-medium">Saldo actual:</span> {expensa.saldo.toFixed(2)}</p>
        <p><span className="font-medium">Estado:</span> {expensa.estado}</p>
      </div>

      <form action={registrarPago} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <input type="hidden" name="expensaId" value={expensa.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="fechaPago" className="text-sm font-medium text-slate-700">Fecha de cobranza</label>
            <input id="fechaPago" name="fechaPago" type="date" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>
          <div className="space-y-1">
            <label htmlFor="monto" className="text-sm font-medium text-slate-700">Monto</label>
            <input id="monto" name="monto" type="number" step="0.01" min="0.01" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="medioPago" className="text-sm font-medium text-slate-700">Medio de cobranza</label>
          <select id="medioPago" name="medioPago" defaultValue="TRANSFERENCIA" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">
            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="DEBITO">DEBITO</option>
            <option value="CREDITO">CREDITO</option>
            <option value="OTRO">OTRO</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="referencia" className="text-sm font-medium text-slate-700">Referencia</label>
          <input id="referencia" name="referencia" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="nota" className="text-sm font-medium text-slate-700">Nota</label>
          <textarea id="nota" name="nota" rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Guardar cobranza
        </button>
      </form>
    </main>
  );
}

