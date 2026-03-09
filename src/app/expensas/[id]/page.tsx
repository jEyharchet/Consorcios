import Link from "next/link";

import { getAccessContext, requireConsorcioAccess } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export default async function ExpensaDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return <div className="p-6">Expensa no encontrada</div>;
  }

  const expensa = await prisma.expensa.findUnique({
    where: { id },
    include: {
      liquidacion: {
        include: {
          consorcio: { select: { id: true, nombre: true } },
        },
      },
      unidad: {
        select: {
          id: true,
          identificador: true,
          tipo: true,
          porcentajeExpensas: true,
        },
      },
      pagos: {
        orderBy: [{ fechaPago: "desc" }, { id: "desc" }],
      },
    },
  });

  if (!expensa) {
    return <div className="p-6">Expensa no encontrada</div>;
  }

  const access = await requireConsorcioAccess(expensa.liquidacion.consorcioId);
  const assignment = access.assignments.find((a) => a.consorcioId === expensa.liquidacion.consorcioId);
  const canRegisterPayment =
    access.isSuperAdmin || assignment?.role === "ADMIN" || assignment?.role === "OPERADOR";

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Link href="/expensas" className="text-blue-600 hover:underline">
            Volver
          </Link>
          <h1 className="text-2xl font-semibold">Expensa #{expensa.id}</h1>
        </div>

        {canRegisterPayment && expensa.estado !== "PAGADA" ? (
          <Link
            href={`/expensas/${expensa.id}/pago`}
            className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Registrar cobranza
          </Link>
        ) : null}
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-2">
        <p>
          <span className="font-medium">Consorcio:</span> {expensa.liquidacion.consorcio.nombre}
        </p>
        <p>
          <span className="font-medium">Liquidacion:</span>{" "}
          <Link href={`/liquidaciones/${expensa.liquidacion.id}`} className="text-blue-600 hover:underline">
            {expensa.liquidacion.periodo}
          </Link>
        </p>
        <p>
          <span className="font-medium">Periodo:</span> {expensa.liquidacion.periodo}
        </p>
        <p>
          <span className="font-medium">Unidad:</span> {expensa.unidad.identificador} ({expensa.unidad.tipo})
        </p>
        <p>
          <span className="font-medium">Porcentaje expensas:</span> {expensa.unidad.porcentajeExpensas ?? "-"}
        </p>
        <p>
          <span className="font-medium">Monto:</span> {expensa.monto.toFixed(2)}
        </p>
        <p>
          <span className="font-medium">Saldo:</span> {expensa.saldo.toFixed(2)}
        </p>
        <p>
          <span className="font-medium">Estado:</span> {expensa.estado}
        </p>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Historial de cobranzas</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-sm text-slate-600">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Medio</th>
                <th className="px-4 py-3 font-medium">Referencia</th>
                <th className="px-4 py-3 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800">
              {expensa.pagos.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={5} className="px-4 py-4 text-slate-500">
                    Sin cobranzas registradas.
                  </td>
                </tr>
              ) : (
                expensa.pagos.map((pago) => (
                  <tr key={pago.id} className="border-t border-slate-100">
                    <td className="px-4 py-4">{pago.fechaPago.toLocaleDateString()}</td>
                    <td className="px-4 py-4">{pago.monto.toFixed(2)}</td>
                    <td className="px-4 py-4">{pago.medioPago}</td>
                    <td className="px-4 py-4">{pago.referencia ?? "-"}</td>
                    <td className="px-4 py-4">{pago.nota ?? "-"}</td>
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

