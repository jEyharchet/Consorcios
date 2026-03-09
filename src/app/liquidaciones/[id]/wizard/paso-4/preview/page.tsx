import Link from "next/link";

import { requireConsorcioAccess } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/prisma";

export default async function LiquidacionPaso4PreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return <div className="p-6">Liquidacion no encontrada</div>;
  }

  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id },
    select: { id: true, consorcioId: true },
  });

  if (!liquidacion) {
    return <div className="p-6">Liquidacion no encontrada</div>;
  }

  await requireConsorcioAccess(liquidacion.consorcioId);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={`/liquidaciones/${liquidacion.id}/wizard/paso-4?continuar=1`} className="text-blue-600 hover:underline">
          Volver al Paso 4
        </Link>

        <a
          href={`/api/liquidaciones/${liquidacion.id}/pdf`}
          download
          className="btn-primary rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Descargar PDF
        </a>
      </div>

      <iframe
        src={`/api/liquidaciones/${liquidacion.id}/pdf`}
        className="h-[900px] w-full rounded-md border border-slate-300 bg-white"
        title={`Preview PDF liquidacion ${liquidacion.id}`}
      />
    </main>
  );
}

