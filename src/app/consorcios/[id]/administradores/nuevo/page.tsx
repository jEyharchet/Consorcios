import type { Buffer } from "node:buffer";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireConsorcioRole } from "../../../../../lib/auth";

import { prisma } from "../../../../../../lib/prisma";
import { buildAdministradorActaPath, saveActaFile, isFileProvided, actaValidationMessages } from "../../../../../lib/actas";
import { validateNoOverlap } from "../../../../../lib/relaciones";

type ActaPayload = {
  actaNombreOriginal: string;
  actaMimeType: string;
  actaSubidaAt: Date;
  actaContenido: Buffer;
};

export default async function NuevoAdministradorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { q?: string; error?: string };
}) {
  const consorcioId = Number(params.id);
  await requireConsorcioRole(consorcioId, ["ADMIN"]);
  const q = searchParams?.q?.trim() ?? "";
  const error = searchParams?.error;

  const consorcio = await prisma.consorcio.findUnique({
    where: { id: consorcioId },
    select: { id: true, nombre: true },
  });

  if (!consorcio) {
    return <div className="p-6">Consorcio no encontrado</div>;
  }

  const personas =
    q.length < 2
      ? []
      : await prisma.persona.findMany({
          where: {
            OR: [
              { apellido: { contains: q } },
              { nombre: { contains: q } },
              { email: { contains: q } },
            ],
          },
          orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
          take: 20,
        });

  async function addAdministrador(formData: FormData) {
    "use server";

    const personaId = Number(formData.get("personaId"));
    const desdeRaw = (formData.get("desde")?.toString() ?? "").trim();
    const hastaRaw = (formData.get("hasta")?.toString() ?? "").trim();
    const q = (formData.get("q")?.toString() ?? "").trim();
    const acta = formData.get("acta");

    const qs = new URLSearchParams();
    if (q) qs.set("q", q);

    if (!desdeRaw) {
      qs.set("error", "desde_requerido");
      redirect(`/consorcios/${consorcioId}/administradores/nuevo?${qs.toString()}`);
    }

    const desde = new Date(desdeRaw);
    const hasta = hastaRaw ? new Date(hastaRaw) : null;

    if (hasta && hasta < desde) {
      qs.set("error", "fin_menor_desde");
      redirect(`/consorcios/${consorcioId}/administradores/nuevo?${qs.toString()}`);
    }

    const existentes = await prisma.consorcioAdministrador.findMany({
      where: {
        consorcioId,
        personaId,
      },
      select: {
        desde: true,
        hasta: true,
      },
    });

    const validacion = validateNoOverlap(existentes, { desde, hasta });

    if (!validacion.ok) {
      qs.set("error", "solape");
      redirect(`/consorcios/${consorcioId}/administradores/nuevo?${qs.toString()}`);
    }

    let actaData: ActaPayload | null = null;

    if (isFileProvided(acta)) {
      const saveResult = await saveActaFile(acta);
      if (!saveResult.ok) {
        qs.set("error", saveResult.code);
        redirect(`/consorcios/${consorcioId}/administradores/nuevo?${qs.toString()}`);
      }
      actaData = saveResult.data;
    }

    await prisma.$transaction(async (tx) => {
      const relacion = await tx.consorcioAdministrador.create({
        data: {
          consorcioId,
          personaId,
          desde,
          hasta,
        },
        select: { id: true },
      });

      if (actaData) {
        await tx.consorcioAdministrador.update({
          where: { id: relacion.id },
          data: {
            actaNombreOriginal: actaData.actaNombreOriginal,
            actaMimeType: actaData.actaMimeType,
            actaPath: buildAdministradorActaPath(relacion.id),
            actaContenido: actaData.actaContenido,
            actaSubidaAt: actaData.actaSubidaAt,
          },
        });
      }
    });

    redirect(`/consorcios/${consorcioId}`);
  }

  const errorMessage =
    error === "desde_requerido"
      ? "Tenes que indicar una fecha de inicio."
      : error === "fin_menor_desde"
        ? "La fecha de fin no puede ser anterior a la fecha de inicio."
        : error === "solape"
          ? "La relacion se solapa con otra existente."
          : error === "invalid_type"
            ? actaValidationMessages.invalid_type
            : error === "max_size"
              ? actaValidationMessages.max_size
              : error === "write_error"
                ? actaValidationMessages.write_error
                : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/consorcios/${consorcioId}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Agregar administrador</h1>
        <p className="text-slate-600">Consorcio: {consorcio.nombre}</p>
      </header>

      {errorMessage ? (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <form method="GET" className="mb-4 flex gap-2">
          <input
            name="q"
            defaultValue={searchParams?.q ?? ""}
            placeholder="Buscar por apellido, nombre o email..."
            className="w-full rounded-md border px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Buscar
          </button>
        </form>

        {q.length < 2 ? (
          <p className="text-sm text-slate-500">Escribi al menos 2 letras para buscar personas.</p>
        ) : personas.length === 0 ? (
          <p className="text-sm text-slate-500">No se encontraron personas.</p>
        ) : (
          <div className="space-y-3">
            {personas.map((persona) => (
              <form
                key={persona.id}
                action={addAdministrador}
                className="rounded-md border border-slate-200 p-3"
                encType="multipart/form-data"
              >
                <input type="hidden" name="personaId" value={persona.id} />
                <input type="hidden" name="q" value={q} />

                <div className="mb-3 text-sm text-slate-800">
                  <p className="font-medium">
                    {persona.apellido}, {persona.nombre}
                  </p>
                  <p className="text-slate-600">
                    {persona.email ?? "Sin email"} | {persona.telefono ?? "Sin telefono"}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor={`desde-${persona.id}`} className="text-sm font-medium text-slate-700">
                      Desde
                    </label>
                    <input
                      id={`desde-${persona.id}`}
                      name="desde"
                      type="date"
                      required
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={`hasta-${persona.id}`} className="text-sm font-medium text-slate-700">
                      Hasta
                    </label>
                    <input
                      id={`hasta-${persona.id}`}
                      name="hasta"
                      type="date"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <label htmlFor={`acta-${persona.id}`} className="text-sm font-medium text-slate-700">
                    Acta de designacion
                  </label>
                  <input
                    id={`acta-${persona.id}`}
                    name="acta"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-slate-500">Formatos permitidos: PDF, JPG, PNG, WEBP. Maximo 10 MB.</p>
                </div>

                <button
                  type="submit"
                  className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Guardar
                </button>
              </form>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
