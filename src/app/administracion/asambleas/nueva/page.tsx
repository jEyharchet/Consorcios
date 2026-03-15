import Link from "next/link";
import { redirect } from "next/navigation";

import { ASAMBLEA_ESTADO, ASAMBLEA_TIPO } from "../../../../lib/administracion";
import { requireConsorcioRole } from "../../../../lib/auth";
import { getActiveConsorcioContext } from "../../../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../../../lib/onboarding";
import { prisma } from "../../../../lib/prisma";
import { buildReturnQuery } from "../../shared";

function getFeedback(error?: string) {
  switch (error) {
    case "fecha_requerida":
      return "La fecha de la asamblea es obligatoria.";
    case "hora_requerida":
      return "La hora de la asamblea es obligatoria.";
    case "lugar_requerido":
      return "El lugar es obligatorio.";
    default:
      return null;
  }
}

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
    select: { id: true, nombre: true },
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

  async function crearAsamblea(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const tipo = (formData.get("tipo")?.toString() ?? ASAMBLEA_TIPO.ORDINARIA).trim();
    const fecha = (formData.get("fecha")?.toString() ?? "").trim();
    const hora = (formData.get("hora")?.toString() ?? "").trim();
    const lugar = (formData.get("lugar")?.toString() ?? "").trim();
    const convocatoriaTexto = (formData.get("convocatoriaTexto")?.toString() ?? "").trim();
    const observaciones = (formData.get("observaciones")?.toString() ?? "").trim();

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    if (!fecha) {
      redirect(`/administracion/asambleas/nueva${buildReturnQuery({ error: "fecha_requerida" })}`);
    }

    if (!hora) {
      redirect(`/administracion/asambleas/nueva${buildReturnQuery({ error: "hora_requerida" })}`);
    }

    if (!lugar) {
      redirect(`/administracion/asambleas/nueva${buildReturnQuery({ error: "lugar_requerido" })}`);
    }

    const asamblea = await prisma.asamblea.create({
      data: {
        consorcioId,
        tipo,
        fecha: new Date(`${fecha}T00:00:00`),
        hora,
        lugar,
        convocatoriaTexto: convocatoriaTexto || null,
        observaciones: observaciones || null,
        estado: ASAMBLEA_ESTADO.BORRADOR,
      },
      select: { id: true },
    });

    redirect(`/administracion/asambleas/${asamblea.id}`);
  }

  const feedback = getFeedback(searchParams?.error);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-6">
        <Link href="/administracion/asambleas" className="text-sm text-blue-600 hover:underline">
          Volver a asambleas
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Nueva asamblea</h1>
        <p className="mt-1 text-sm text-slate-600">Alta inicial para el consorcio activo - {consorcio.nombre}.</p>
      </header>

      {feedback ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback}
        </div>
      ) : null}

      <form action={crearAsamblea} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="consorcioId" value={consorcio.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="tipo" className="text-sm font-medium text-slate-700">
              Tipo
            </label>
            <select id="tipo" name="tipo" defaultValue={ASAMBLEA_TIPO.ORDINARIA} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value={ASAMBLEA_TIPO.ORDINARIA}>ORDINARIA</option>
              <option value={ASAMBLEA_TIPO.EXTRAORDINARIA}>EXTRAORDINARIA</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="lugar" className="text-sm font-medium text-slate-700">
              Lugar
            </label>
            <input id="lugar" name="lugar" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="fecha" className="text-sm font-medium text-slate-700">
              Fecha
            </label>
            <input id="fecha" name="fecha" type="date" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          </div>

          <div className="space-y-1">
            <label htmlFor="hora" className="text-sm font-medium text-slate-700">
              Hora
            </label>
            <input id="hora" name="hora" type="time" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="convocatoriaTexto" className="text-sm font-medium text-slate-700">
            Texto base de convocatoria
          </label>
          <textarea
            id="convocatoriaTexto"
            name="convocatoriaTexto"
            rows={5}
            defaultValue="Se convoca a los propietarios a la asamblea del consorcio {{consorcio}}."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="observaciones" className="text-sm font-medium text-slate-700">
            Observaciones
          </label>
          <textarea id="observaciones" name="observaciones" rows={4} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Crear asamblea
        </button>
      </form>
    </main>
  );
}
