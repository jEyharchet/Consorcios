import Link from "next/link";

import { getAccessContext, requireConsorcioAccess } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { getPeriodoVariants } from "../../../lib/periodo";
import { formatDateAR } from "../../../lib/relaciones";

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
    },
  });

  if (!gasto) {
    return <div className="p-6">Gasto no encontrado</div>;
  }

  await requireConsorcioAccess(gasto.consorcioId);
  const access = await getAccessContext();
  const userAssignment = access.assignments.find((a) => a.consorcioId === gasto.consorcioId);
  const canEditByRole = access.isSuperAdmin || userAssignment?.role === "ADMIN" || userAssignment?.role === "OPERADOR";

  const liquidacionBloqueante = await prisma.liquidacion.findFirst({
    where: {
      consorcioId: gasto.consorcioId,
      periodo: { in: getPeriodoVariants(gasto.periodo) },
      estado: { in: ["EMITIDA", "CERRADA"] },
    },
    select: { id: true },
  });

  const bloqueadoPorLiquidacion = Boolean(liquidacionBloqueante);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href="/gastos" className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">{gasto.concepto}</h1>
      </header>

      {canEditByRole && !bloqueadoPorLiquidacion ? (
        <Link
          href={`/gastos/${gasto.id}/editar`}
          className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Editar
        </Link>
      ) : null}

      {canEditByRole && bloqueadoPorLiquidacion ? (
        <p className="mt-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este gasto no se puede editar porque la liquidacion del periodo esta emitida o cerrada.
        </p>
      ) : null}

      <div className="mt-6 space-y-2 rounded-lg border border-slate-200 bg-white p-6">
        <p><span className="font-medium">Consorcio:</span> {gasto.consorcio.nombre}</p>
        <p><span className="font-medium">Fecha:</span> {formatDateAR(gasto.fecha)}</p>
        <p><span className="font-medium">Periodo:</span> {gasto.periodo}</p>
        <p><span className="font-medium">Concepto:</span> {gasto.concepto}</p>
        <p><span className="font-medium">Descripcion:</span> {gasto.descripcion ?? "-"}</p>
        <p><span className="font-medium">Tipo expensa:</span> {gasto.tipoExpensa}</p>
        <p><span className="font-medium">Rubro:</span> {gasto.rubroExpensa}</p>
        <p><span className="font-medium">Proveedor:</span> {gasto.proveedor?.nombre ?? "-"}</p>
        <p><span className="font-medium">Monto:</span> {gasto.monto.toFixed(2)}</p>
        <p>
          <span className="font-medium">Liquidacion asociada:</span>{" "}
          {gasto.liquidacion ? `#${gasto.liquidacion.id} (${gasto.liquidacion.periodo})` : "-"}
        </p>
        <p>
          <span className="font-medium">Comprobante:</span>{" "}
          {gasto.comprobantePath ? (
            <a href={gasto.comprobantePath} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              Ver comprobante
            </a>
          ) : (
            "-"
          )}
        </p>
      </div>
    </main>
  );
}


