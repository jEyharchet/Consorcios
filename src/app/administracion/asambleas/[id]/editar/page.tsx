import Link from "next/link";
import { notFound } from "next/navigation";

import { getFirmaAdministradorVigente } from "../../../../../lib/administracion";
import { ASAMBLEA_ESTADO } from "../../../../../lib/administracion-shared";
import { normalizarFirmaAltoPx, normalizarFirmaEspacioPx } from "../../../../../lib/asamblea-convocatoria-preview";
import { requireConsorcioRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { formatDateInput } from "../../../shared";
import { guardarAsambleaEditor } from "../../nueva/actions";
import { getEditorFeedback } from "../../nueva/feedback";
import NuevaAsambleaEditor from "../../nueva/NuevaAsambleaEditor";

export default async function EditarBorradorAsambleaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; ok?: string };
}) {
  const asambleaId = Number(params.id);
  if (!Number.isInteger(asambleaId)) {
    notFound();
  }

  const asamblea = await prisma.asamblea.findUnique({
    where: { id: asambleaId },
    select: {
      id: true,
      consorcioId: true,
      estado: true,
      tipo: true,
      fecha: true,
      hora: true,
      lugar: true,
      observaciones: true,
      firmaEspacioPx: true,
      firmaAltoPx: true,
      consorcio: { select: { nombre: true, tituloLegal: true } },
      ordenDia: {
        orderBy: [{ orden: "asc" }, { id: "asc" }],
        select: { id: true, titulo: true },
      },
    },
  });

  if (!asamblea) {
    notFound();
  }

  await requireConsorcioRole(asamblea.consorcioId, ["ADMIN", "OPERADOR"]);

  const detalleHref = `/administracion/asambleas/${asamblea.id}`;

  if (asamblea.estado !== ASAMBLEA_ESTADO.BORRADOR) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <Link href={detalleHref} className="text-sm text-blue-600 hover:underline">
          Volver a la asamblea
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Editar borrador</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          Esta asamblea ya no está en borrador ({asamblea.estado}). Los cambios se hacen desde su detalle.
        </p>
      </main>
    );
  }

  const feedback = getEditorFeedback({ error: searchParams?.error, ok: searchParams?.ok });
  const firma = await getFirmaAdministradorVigente(asamblea.consorcioId);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/administracion/asambleas" className="text-blue-600 hover:underline">
            Volver a asambleas
          </Link>
          <Link href={detalleHref} className="text-blue-600 hover:underline">
            Ver detalle de la asamblea
          </Link>
        </div>
        <h1 className="mt-3 text-2xl font-semibold">
          Borrador de asamblea{" "}
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-xs font-medium text-slate-600">
            BORRADOR
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate-600">{asamblea.consorcio.nombre}</p>
      </header>

      {feedback ? (
        <div
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            feedback.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <NuevaAsambleaEditor
        // Remonta el editor con los datos guardados después de cada guardado.
        key={`${asamblea.id}-${searchParams?.ok ?? ""}-${Date.now()}`}
        action={guardarAsambleaEditor}
        inicial={{
          asambleaId: asamblea.id,
          tipo: asamblea.tipo,
          fecha: formatDateInput(asamblea.fecha),
          hora: asamblea.hora,
          lugar: asamblea.lugar,
          observaciones: asamblea.observaciones ?? "",
          firmaEspacioPx: normalizarFirmaEspacioPx(asamblea.firmaEspacioPx),
          firmaAltoPx: normalizarFirmaAltoPx(asamblea.firmaAltoPx),
          ordenDelDia: asamblea.ordenDia,
        }}
        consorcioId={asamblea.consorcioId}
        consorcioNombre={asamblea.consorcio.nombre}
        consorcioNombreLegal={asamblea.consorcio.tituloLegal ?? asamblea.consorcio.nombre}
        firmaUrl={firma.firmaUrl}
        firmaAclaracion={firma.firmaAclaracion}
        firmaRol={firma.firmaRol}
      />
    </main>
  );
}
