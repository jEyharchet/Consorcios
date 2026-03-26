import Link from "next/link";

import { getActiveConsorcioContext } from "../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../lib/onboarding";
import { prisma } from "../../lib/prisma";

export default async function AdministracionPage() {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo valido para mostrar.
        </p>
      </main>
    );
  }

  const [consorcio, asambleasCount, comunicacionesCount, configuracionCount, respuestasCount] = await Promise.all([
    prisma.consorcio.findUnique({
      where: { id: activeConsorcioId },
      select: { id: true, nombre: true },
    }),
    prisma.asamblea.count({
      where: { consorcioId: activeConsorcioId },
    }),
    prisma.envioEmail.count({
      where: {
        consorcioId: activeConsorcioId,
        tipoEnvio: "COMUNICACION_LIBRE",
      },
    }),
    prisma.consorcioConfiguracion.count({
      where: {
        consorcioId: activeConsorcioId,
      },
    }),
    prisma.respuestaEmail.count({
      where: {
        consorcioId: activeConsorcioId,
      },
    }),
  ]);

  if (!consorcio) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Administracion</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontro el consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Administracion</h1>
        <p className="mt-1 text-sm text-slate-600">
          Centro institucional del consorcio activo - {consorcio.nombre}.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Link
          href="/administracion/comunicaciones"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
        >
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Submodulo</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Comunicaciones</h2>
          <p className="mt-3 text-sm text-slate-600">
            Mails personalizados a responsables por unidad o para todo el consorcio.
          </p>
          <p className="mt-6 text-3xl font-semibold text-slate-950">{comunicacionesCount}</p>
          <p className="text-sm text-slate-500">envios trazados</p>
        </Link>

        <Link
          href="/administracion/asambleas"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
        >
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Submodulo</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Asambleas</h2>
          <p className="mt-3 text-sm text-slate-600">
            Convocatorias, orden del dia, acta editable y seguimiento institucional.
          </p>
          <p className="mt-6 text-3xl font-semibold text-slate-950">{asambleasCount}</p>
          <p className="text-sm text-slate-500">asambleas registradas</p>
        </Link>

        <Link
          href="/administracion/configuracion"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
        >
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Submodulo</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Configuracion</h2>
          <p className="mt-3 text-sm text-slate-600">
            Reglas por consorcio para expensas, votaciones, plazos y comportamiento institucional.
          </p>
          <p className="mt-6 text-3xl font-semibold text-slate-950">{configuracionCount}</p>
          <p className="text-sm text-slate-500">registro por consorcio activo</p>
        </Link>

        <Link
          href="/administracion/respuestas"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
        >
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Submodulo</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Respuestas</h2>
          <p className="mt-3 text-sm text-slate-600">
            Bandeja de respuestas recibidas, asociacion con envios originales y gestion de seguimiento.
          </p>
          <p className="mt-6 text-3xl font-semibold text-slate-950">{respuestasCount}</p>
          <p className="text-sm text-slate-500">respuestas registradas</p>
        </Link>
      </section>
    </main>
  );
}
