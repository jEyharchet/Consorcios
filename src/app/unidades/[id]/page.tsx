import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "../../../../lib/prisma";
import { requireConsorcioAccess, requireConsorcioRole } from "../../../lib/auth";
import { isVigente, normalizeDate } from "../../../lib/relaciones";
import {
  areUnidadRelacionPorcentajeTotalsValid,
  calculateUnidadRelacionPorcentajeTotals,
} from "../../../lib/unidad-relacion";
import UnidadRelacionesEditor from "./UnidadRelacionesEditor";

export default async function UnidadDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { finalizar?: string; error?: string; ok?: string };
}) {
  const id = Number(params.id);
  const finalizarId = Number(searchParams?.finalizar);
  const error = searchParams?.error;
  const ok = searchParams?.ok;

  const unidad = await prisma.unidad.findUnique({
    where: { id },
    include: {
      consorcio: true,
      personas: {
        include: {
          persona: true,
        },
      },
    },
  });

  if (!unidad) {
    return <div className="p-6">Unidad no encontrada</div>;
  }

  await requireConsorcioAccess(unidad.consorcioId);

  async function removePersona(formData: FormData) {
    "use server";

    const unidadId = Number(formData.get("unidadId"));
    const relacionId = Number(formData.get("relacionId"));

    const unidadActual = await prisma.unidad.findUnique({ where: { id: unidadId }, select: { consorcioId: true } });
    if (!unidadActual) {
      redirect("/consorcios");
    }

    await requireConsorcioRole(unidadActual.consorcioId, ["ADMIN", "OPERADOR"]);

    await prisma.unidadPersona.delete({
      where: { id: relacionId },
    });

    redirect(`/unidades/${unidadId}`);
  }

  async function finalizarRelacion(formData: FormData) {
    "use server";

    const unidadId = Number(formData.get("unidadId"));
    const relacionId = Number(formData.get("relacionId"));
    const hastaRaw = (formData.get("hasta")?.toString() ?? "").trim();

    const unidadActual = await prisma.unidad.findUnique({ where: { id: unidadId }, select: { consorcioId: true } });
    if (!unidadActual) {
      redirect("/consorcios");
    }

    await requireConsorcioRole(unidadActual.consorcioId, ["ADMIN", "OPERADOR"]);

    if (!hastaRaw) {
      redirect(`/unidades/${unidadId}?error=fin_requerido&finalizar=${relacionId}`);
    }

    const relacion = await prisma.unidadPersona.findUnique({
      where: { id: relacionId },
      select: { id: true, desde: true, hasta: true },
    });

    if (!relacion || relacion.hasta !== null) {
      redirect(`/unidades/${unidadId}?error=ya_finalizada`);
    }

    const hasta = new Date(hastaRaw);

    if (hasta < relacion.desde) {
      redirect(`/unidades/${unidadId}?error=fin_menor_desde&finalizar=${relacionId}`);
    }

    await prisma.unidadPersona.update({
      where: { id: relacionId },
      data: { hasta },
    });

    redirect(`/unidades/${unidadId}`);
  }

  async function guardarDistribucion(formData: FormData) {
    "use server";

    const unidadId = Number(formData.get("unidadId"));
    const payloadRaw = (formData.get("payload")?.toString() ?? "").trim();

    const unidadActual = await prisma.unidad.findUnique({ where: { id: unidadId }, select: { consorcioId: true } });
    if (!unidadActual) {
      redirect("/consorcios");
    }

    await requireConsorcioRole(unidadActual.consorcioId, ["ADMIN", "OPERADOR"]);

    let payload:
      | Array<{
          id: number;
          porcentajeExpensasOrdinarias: number;
          porcentajeExpensasExtraordinarias: number;
          recibeLiquidacion: boolean;
        }>
      | null = null;

    try {
      payload = JSON.parse(payloadRaw);
    } catch {
      redirect(`/unidades/${unidadId}?error=porcentajes_invalidos`);
    }

    if (!Array.isArray(payload) || payload.length === 0) {
      redirect(`/unidades/${unidadId}?error=porcentajes_invalidos`);
    }

    const today = new Date();
    const relacionesActivas = await prisma.unidadPersona.findMany({
      where: {
        unidadId,
        desde: { lte: today },
        OR: [{ hasta: null }, { hasta: { gte: today } }],
      },
      select: {
        id: true,
        tipoRelacion: true,
      },
    });

    const relationIds = new Set(relacionesActivas.map((relacion) => relacion.id));
    if (relationIds.size !== payload.length || payload.some((row) => !relationIds.has(row.id))) {
      redirect(`/unidades/${unidadId}?error=porcentajes_invalidos`);
    }

    const normalizedRows = payload.map((row) => {
      const relacion = relacionesActivas.find((item) => item.id === row.id);
      const porcentajeExpensasOrdinarias = Number(row.porcentajeExpensasOrdinarias);
      const porcentajeExpensasExtraordinarias = Number(row.porcentajeExpensasExtraordinarias);

      if (
        !relacion ||
        !Number.isFinite(porcentajeExpensasOrdinarias) ||
        !Number.isFinite(porcentajeExpensasExtraordinarias) ||
        porcentajeExpensasOrdinarias < 0 ||
        porcentajeExpensasOrdinarias > 100 ||
        porcentajeExpensasExtraordinarias < 0 ||
        porcentajeExpensasExtraordinarias > 100
      ) {
        redirect(`/unidades/${unidadId}?error=porcentajes_invalidos`);
      }

      return {
        id: row.id,
        tipoRelacion: relacion.tipoRelacion,
        porcentajeExpensasOrdinarias,
        porcentajeExpensasExtraordinarias,
        recibeLiquidacion: relacion.tipoRelacion === "INQUILINO" ? Boolean(row.recibeLiquidacion) : false,
      };
    });

    const totals = calculateUnidadRelacionPorcentajeTotals(normalizedRows);
    if (!areUnidadRelacionPorcentajeTotalsValid(totals)) {
      redirect(`/unidades/${unidadId}?error=porcentajes_totales`);
    }

    await prisma.$transaction(
      normalizedRows.map((row) =>
        prisma.unidadPersona.update({
          where: { id: row.id },
          data: {
            porcentajeExpensasOrdinarias: row.porcentajeExpensasOrdinarias,
            porcentajeExpensasExtraordinarias: row.porcentajeExpensasExtraordinarias,
            recibeLiquidacion: row.recibeLiquidacion,
          },
        }),
      ),
    );

    redirect(`/unidades/${unidadId}?ok=distribucion_guardada`);
  }

  async function deleteUnidad(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));

    const unidadActual = await prisma.unidad.findUnique({ where: { id }, select: { consorcioId: true } });
    if (!unidadActual) {
      redirect("/consorcios");
    }

    await requireConsorcioRole(unidadActual.consorcioId, ["ADMIN"]);

    await prisma.unidad.delete({
      where: { id },
    });

    redirect("/consorcios");
  }

  const today = normalizeDate(new Date());

  const relacionesOrdenadas = unidad.personas
    .slice()
    .sort((a, b) => {
      const aVigente = isVigente(a.desde, a.hasta, today);
      const bVigente = isVigente(b.desde, b.hasta, today);

      if (aVigente !== bVigente) {
        return aVigente ? -1 : 1;
      }

      return b.desde.getTime() - a.desde.getTime();
    });

  const errorMessage =
    error === "fin_requerido"
      ? "Tenes que indicar una fecha de fin."
      : error === "ya_finalizada"
        ? "La relacion ya estaba finalizada."
        : error === "fin_menor_desde"
          ? "La fecha de fin no puede ser anterior a la fecha de inicio."
          : error === "porcentajes_totales"
            ? "Los porcentajes de expensas ordinarias y extraordinarias deben sumar 100% entre las relaciones vigentes."
            : error === "porcentajes_invalidos"
              ? "No pudimos validar la distribución de porcentajes. Probá nuevamente."
              : null;
  const successMessage = ok === "distribucion_guardada" ? "La distribución de notificaciones se guardó correctamente." : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <Link href={`/consorcios/${unidad.consorcioId}`} className="text-blue-600 hover:underline">
        Volver al consorcio
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Unidad {unidad.identificador}</h1>

      <Link
        href={`/unidades/${params.id}/editar`}
        className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Editar
      </Link>

      <form action={deleteUnidad} className="inline-block">
        <input type="hidden" name="id" value={unidad.id} />
        <button
          type="submit"
          className="ml-2 inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Eliminar
        </button>
      </form>

      <div className="mt-6 space-y-2 rounded-lg border border-slate-200 bg-white p-6">
        <p>
          <span className="font-medium">Consorcio:</span> {unidad.consorcio.nombre}
        </p>
        <p>
          <span className="font-medium">Identificador:</span> {unidad.identificador}
        </p>
        <p>
          <span className="font-medium">Tipo:</span> {unidad.tipo}
        </p>
        <p>
          <span className="font-medium">Piso:</span> {unidad.piso ?? "-"} / <span className="font-medium">Departamento:</span>{" "}
          {unidad.departamento ?? "-"}
        </p>
        <p>
          <span className="font-medium">Superficie:</span> {unidad.superficie ?? "-"}
        </p>
        <p>
          <span className="font-medium">Porcentaje expensas de la unidad:</span> {unidad.porcentajeExpensas ?? "-"}
        </p>
      </div>

      <h2 className="mt-8 text-xl font-semibold">Personas</h2>

      {successMessage ? (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <Link
        href={`/unidades/${params.id}/personas/nueva`}
        className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Agregar persona
      </Link>

      {relacionesOrdenadas.length === 0 ? (
        <p className="mt-2 text-slate-500">Esta unidad aun no tiene personas asociadas.</p>
      ) : (
        <UnidadRelacionesEditor
          unidadId={unidad.id}
          finalizarId={Number.isInteger(finalizarId) ? finalizarId : undefined}
          errorMessage={errorMessage}
          onSaveDistribucion={guardarDistribucion}
          onRemovePersona={removePersona}
          onFinalizarRelacion={finalizarRelacion}
          relaciones={relacionesOrdenadas.map((rel) => {
            const vigente = isVigente(rel.desde, rel.hasta, today);

            return {
              id: rel.id,
              persona: {
                nombre: rel.persona.nombre,
                apellido: rel.persona.apellido,
                email: rel.persona.email,
                telefono: rel.persona.telefono,
              },
              tipoRelacion: rel.tipoRelacion,
              porcentajeExpensasOrdinarias: rel.porcentajeExpensasOrdinarias ?? 0,
              porcentajeExpensasExtraordinarias: rel.porcentajeExpensasExtraordinarias ?? 0,
              recibeLiquidacion: rel.recibeLiquidacion ?? false,
              desde: rel.desde.toISOString(),
              hasta: rel.hasta ? rel.hasta.toISOString() : null,
              vigente,
              inactiva: !vigente,
            };
          })}
        />
      )}
    </main>
  );
}
