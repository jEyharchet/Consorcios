import Link from "next/link";
import { redirect } from "next/navigation";

import { ASAMBLEA_ESTADO, ASAMBLEA_TIPO } from "../../../../lib/administracion-shared";
import { firmaValidationMessages, isFirmaFileProvided, saveAsambleaFirmaFile } from "../../../../lib/asamblea-firma";
import { requireConsorcioRole } from "../../../../lib/auth";
import { getActiveConsorcioContext } from "../../../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../../../lib/onboarding";
import { prisma } from "../../../../lib/prisma";
import { buildReturnQuery } from "../../shared";
import NuevaAsambleaEditor from "./NuevaAsambleaEditor";

function getFeedback(error?: string) {
  switch (error) {
    case "fecha_requerida":
      return "La fecha de la asamblea es obligatoria.";
    case "hora_requerida":
      return "La hora de la asamblea es obligatoria.";
    case "lugar_requerido":
      return "El lugar es obligatorio.";
    case "firma_invalid_type":
      return firmaValidationMessages.invalid_type;
    case "firma_max_size":
      return firmaValidationMessages.max_size;
    case "firma_write_error":
      return firmaValidationMessages.write_error;
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

  async function crearAsamblea(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const tipo = (formData.get("tipo")?.toString() ?? ASAMBLEA_TIPO.ORDINARIA).trim();
    const fecha = (formData.get("fecha")?.toString() ?? "").trim();
    const hora = (formData.get("hora")?.toString() ?? "").trim();
    const lugar = (formData.get("lugar")?.toString() ?? "").trim();
    const observaciones = (formData.get("observaciones")?.toString() ?? "").trim();
    const firmaAclaracion = (formData.get("firmaAclaracion")?.toString() ?? "").trim();
    const firmaRol = (formData.get("firmaRol")?.toString() ?? "").trim();
    const ordenTitulos = formData
      .getAll("ordenTitulo")
      .map((value) => value.toString().trim());
    const firmaArchivo = formData.get("firmaArchivo");

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

    let firmaData:
      | {
          firmaNombreOriginal: string;
          firmaMimeType: string;
          firmaContenido: Buffer;
          firmaSubidaAt: Date;
        }
      | null = null;

    if (isFirmaFileProvided(firmaArchivo)) {
      const saved = await saveAsambleaFirmaFile(firmaArchivo);
      if (!saved.ok) {
        redirect(`/administracion/asambleas/nueva${buildReturnQuery({ error: `firma_${saved.code}` })}`);
      }
      firmaData = saved.data;
    }

    const asamblea = await prisma.asamblea.create({
      data: {
        consorcioId,
        tipo,
        fecha: new Date(`${fecha}T00:00:00`),
        hora,
        lugar,
        convocatoriaTexto: null,
        observaciones: observaciones || null,
        firmaNombreOriginal: firmaData?.firmaNombreOriginal ?? null,
        firmaMimeType: firmaData?.firmaMimeType ?? null,
        firmaContenido: firmaData?.firmaContenido ?? null,
        firmaSubidaAt: firmaData?.firmaSubidaAt ?? null,
        firmaAclaracion: firmaAclaracion || null,
        firmaRol: firmaRol || null,
        estado: ASAMBLEA_ESTADO.BORRADOR,
        ordenDia: {
          create: ordenTitulos
            .map((titulo, index) => ({
              orden: index + 1,
              titulo,
              descripcion: null,
            }))
            .filter((item) => item.titulo.length > 0),
        },
      },
      select: { id: true },
    });

    redirect(`/administracion/asambleas/${asamblea.id}`);
  }

  const feedback = getFeedback(searchParams?.error);

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
          {feedback}
        </div>
      ) : null}

      <NuevaAsambleaEditor
        action={crearAsamblea}
        consorcioId={consorcio.id}
        consorcioNombreLegal={consorcio.tituloLegal ?? consorcio.nombre}
      />
    </main>
  );
}
