import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccessContext, requireConsorcioAccess, requireConsorcioRole } from "@/lib/auth";
import {
  buildLiquidacionClosureDrafts,
  formatEmailSummary,
  sendLiquidacionClosureDrafts,
} from "@/lib/liquidacion-email";
import { prisma } from "@/lib/prisma";

import LiquidacionEmailResendForm from "./LiquidacionEmailResendForm";

function buildReturnQuery(values: Record<string, string | undefined | null>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function getFeedback(searchParams?: {
  ok?: string;
  error?: string;
  enviados?: string;
  fallidos?: string;
  sinDestinatario?: string;
}) {
  if (searchParams?.ok === "reenvio_ok") {
    return {
      type: "ok" as const,
      text: formatEmailSummary({
        total:
          Number(searchParams?.enviados ?? 0) +
          Number(searchParams?.fallidos ?? 0) +
          Number(searchParams?.sinDestinatario ?? 0),
        enviados: Number(searchParams?.enviados ?? 0),
        fallidos: Number(searchParams?.fallidos ?? 0),
        sinDestinatario: Number(searchParams?.sinDestinatario ?? 0),
      }),
    };
  }

  if (searchParams?.error === "sin_drafts") {
    return {
      type: "error" as const,
      text: "Debes seleccionar al menos un destinatario para reenviar.",
    };
  }

  return null;
}

export default async function LiquidacionEmailsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    ok?: string;
    error?: string;
    enviados?: string;
    fallidos?: string;
    sinDestinatario?: string;
  };
}) {
  const liquidacionId = Number(params.id);
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    select: {
      id: true,
      estado: true,
      periodo: true,
      consorcioId: true,
      consorcio: { select: { nombre: true } },
    },
  });

  if (!liquidacion) {
    return <main className="mx-auto max-w-6xl px-6 py-10">Liquidacion no encontrada.</main>;
  }

  await requireConsorcioAccess(liquidacion.consorcioId);
  const access = await getAccessContext();
  const assignmentRole = access.isSuperAdmin
    ? "ADMIN"
    : access.assignments.find((a) => a.consorcioId === liquidacion.consorcioId)?.role;
  const canOperate = access.isSuperAdmin || assignmentRole === "ADMIN" || assignmentRole === "OPERADOR";

  if (liquidacion.estado !== "FINALIZADA" && liquidacion.estado !== "CERRADA") {
    redirect(`/liquidaciones/${liquidacion.id}`);
  }

  const drafts = await buildLiquidacionClosureDrafts(liquidacion.id);
  const feedback = getFeedback(searchParams);
  const defaultSubject = "{{consorcio}} - Liquidación {{periodo}} - {{responsables}}";
  const defaultMessage = [
    "La liquidación del período {{periodo}} ya fue cerrada y la boleta correspondiente se encuentra disponible.",
    "",
    "Responsables: {{responsables}}",
    "Unidades: {{unidades}}",
    "Vencimiento: {{vencimiento}}",
    "Importe liquidado: {{importe}}",
    "",
    "Boleta: {{linkBoleta}}",
    "Rendición: {{linkRendicion}}",
  ].join("\n");

  async function reenviarSeleccionados(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const currentLiquidacionId = Number(formData.get("liquidacionId"));

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    const selectedDrafts = formData
      .getAll("draftUnitId")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
      .filter((unidadId) => formData.get(`enviar_${unidadId}`) === "on")
      .map((unidadId) => {
        const boletaArchivoIdRaw = (formData.get(`boletaArchivoId_${unidadId}`)?.toString() ?? "").trim();
        return {
          unidadId,
          unidadIdsCsv: (formData.get(`unidadIdsCsv_${unidadId}`)?.toString() ?? "").trim(),
          unidadCount: Number(formData.get(`unidadCount_${unidadId}`) ?? 1),
          unidadLabel: (formData.get(`unidadLabel_${unidadId}`)?.toString() ?? "").trim(),
          responsablesLabel: (formData.get(`responsablesLabel_${unidadId}`)?.toString() ?? "").trim(),
          responsableIdsCsv: (formData.get(`responsableIdsCsv_${unidadId}`)?.toString() ?? "").trim(),
          destinatario: (formData.get(`destinatario_${unidadId}`)?.toString() ?? "").trim(),
          importeLiquidado: Number(formData.get(`importeLiquidado_${unidadId}`) ?? 0),
          boletaArchivoId: /^\d+$/.test(boletaArchivoIdRaw) ? Number(boletaArchivoIdRaw) : null,
        };
      });

    if (selectedDrafts.length === 0) {
      redirect(`/liquidaciones/${currentLiquidacionId}/emails${buildReturnQuery({ error: "sin_drafts" })}`);
    }

    const summary = await sendLiquidacionClosureDrafts({
      liquidacionId: currentLiquidacionId,
      drafts: selectedDrafts,
      template: {
        asuntoBase: (formData.get("asuntoBase")?.toString() ?? "").trim(),
        mensajeBase: (formData.get("mensajeBase")?.toString() ?? "").trim(),
      },
    });

    redirect(
      `/liquidaciones/${currentLiquidacionId}/emails${buildReturnQuery({
        ok: "reenvio_ok",
        enviados: String(summary.enviados),
        fallidos: String(summary.fallidos),
        sinDestinatario: String(summary.sinDestinatario),
      })}`,
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/liquidaciones/${liquidacion.id}`} className="text-sm text-blue-600 hover:underline">
            Volver a la liquidacion
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">Reenviar emails de liquidacion</h1>
          <p className="mt-1 text-sm text-slate-600">
            Liquidacion {liquidacion.periodo} - {liquidacion.consorcio.nombre}
          </p>
        </div>
      </header>

      {feedback ? (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            feedback.type === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {!canOperate ? (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          Tenes acceso de lectura. El reenvio de emails esta disponible para administradores u operadores.
        </div>
      ) : null}

      {drafts.length === 0 ? (
        <section className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
          No hay destinatarios agrupados disponibles para esta liquidacion.
        </section>
      ) : (
        <LiquidacionEmailResendForm
          drafts={drafts}
          canOperate={canOperate}
          action={reenviarSeleccionados}
          consorcioId={liquidacion.consorcioId}
          liquidacionId={liquidacion.id}
          defaultSubject={defaultSubject}
          defaultMessage={defaultMessage}
        />
      )}
    </main>
  );
}
