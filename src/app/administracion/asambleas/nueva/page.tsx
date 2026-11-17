import Link from "next/link";

import { getFirmaAdministradorVigente } from "../../../../lib/administracion";
import { getActiveConsorcioContext } from "../../../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../../../lib/onboarding";
import { prisma } from "../../../../lib/prisma";
import { guardarAsambleaEditor } from "./actions";
import { getEditorFeedback } from "./feedback";
import NuevaAsambleaEditor from "./NuevaAsambleaEditor";

export default async function NuevaAsambleaPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Nueva asamblea</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo valido para mostrar.
        </p>
      </main>
    );
  }

  const canOperate =
    access.isSuperAdmin ||
    access.assignments.some(
      (assignment) =>
        assignment.consorcioId === activeConsorcioId &&
        (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
    );

  const consorcio = await prisma.consorcio.findUnique({
    where: { id: activeConsorcioId },
    select: { id: true, nombre: true, tituloLegal: true },
  });

  if (!consorcio) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Nueva asamblea</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontro el consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  if (!canOperate) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Nueva asamblea</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          Necesitas permisos de administrador u operador para crear asambleas.
        </p>
      </main>
    );
  }

  const feedback = getEditorFeedback({ error: searchParams?.error });
  const firma = await getFirmaAdministradorVigente(consorcio.id);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6">
        <Link href="/administracion/asambleas" className="text-sm text-blue-600 hover:underline">
          Volver a asambleas
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Nueva asamblea</h1>
        <p className="mt-1 text-sm text-slate-600">Alta inicial para el consorcio activo - {consorcio.nombre}.</p>
      </header>

      {feedback ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback.text}
        </div>
      ) : null}

      <NuevaAsambleaEditor
        action={guardarAsambleaEditor}
        consorcioId={consorcio.id}
        consorcioNombre={consorcio.nombre}
        consorcioNombreLegal={consorcio.tituloLegal ?? consorcio.nombre}
        firmaUrl={firma.firmaUrl}
        firmaAclaracion={firma.firmaAclaracion}
        firmaRol={firma.firmaRol}
      />
    </main>
  );
}
