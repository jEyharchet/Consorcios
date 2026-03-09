import Link from "next/link";
import { redirect } from "next/navigation";

import { requireConsorcioRole } from "../../../../../lib/auth";
import {
  buildPaso4AccordionSectionsHtml,
  buildPaso4PreviewStyles,
} from "../../../../../lib/liquidacion-pdf-html";
import { getLiquidacionPaso4Data } from "../../../../../lib/liquidacion-paso4";
import RegenerarArchivosButton from "../../../_components/RegenerarArchivosButton";
import { prisma } from "../../../../../lib/prisma";

function formatPeriodoLabel(periodo: string | null) {
  if (!periodo) return "-";
  const [year, month] = periodo.split("-");
  if (!year || !month) return periodo;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
}

export default async function LiquidacionWizardPaso4Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { continuar?: string; error?: string; ok?: string };
}) {
  const id = Number(params.id);
  const data = await getLiquidacionPaso4Data(id);

  if (!data) {
    return <div className="p-6">Liquidacion no encontrada</div>;
  }

  const liquidacion = data.liquidacion;
  const canEdit = liquidacion.estado !== "FINALIZADA";
  const previewSections = buildPaso4AccordionSectionsHtml(data);

  async function guardarTextos(formData: FormData) {
    "use server";

    const liquidacionId = Number(formData.get("liquidacionId"));
    const current = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      select: { id: true, consorcioId: true, estado: true },
    });

    if (!current) redirect("/liquidaciones");

    await requireConsorcioRole(current.consorcioId, ["ADMIN", "OPERADOR"]);

    if (current.estado === "FINALIZADA") {
      redirect(`/liquidaciones/${current.id}/wizard/paso-4?continuar=1&error=ya_finalizada`);
    }

    const datosJuicios = formData.get("datosJuicios")?.toString() ?? "";
    const recomendacionesGenerales = formData.get("recomendacionesGenerales")?.toString() ?? "";
    const novedadesMes = formData.get("novedadesMes")?.toString() ?? "";

    await prisma.liquidacion.update({
      where: { id: current.id },
      data: {
        datosJuicios: datosJuicios.trim() ? datosJuicios : null,
        recomendacionesGenerales: recomendacionesGenerales.trim() ? recomendacionesGenerales : null,
        novedadesMes: novedadesMes.trim() ? novedadesMes : null,
      },
    });

    redirect(`/liquidaciones/${current.id}/wizard/paso-4?continuar=1&ok=guardado`);
  }

  async function deshacerLiquidacion() {
    "use server";

    const current = await prisma.liquidacion.findUnique({
      where: { id: liquidacion.id },
      select: { id: true, consorcioId: true, estado: true },
    });

    if (!current) redirect("/liquidaciones");

    await requireConsorcioRole(current.consorcioId, ["ADMIN", "OPERADOR"]);

    if (current.estado === "FINALIZADA") {
      redirect(`/liquidaciones/${current.id}/wizard/paso-4?continuar=1&error=ya_finalizada`);
    }

    await prisma.liquidacion.update({
      where: { id: current.id },
      data: { wizardPasoActual: 3 },
    });

    redirect(`/liquidaciones/${current.id}/wizard/paso-3`);
  }

  const initialGate = searchParams?.continuar !== "1";

  const message =
    searchParams?.ok === "guardado"
      ? "Cambios guardados correctamente."
      : searchParams?.ok === "finalizada"
        ? "Liquidacion finalizada correctamente. Se generaron la rendicion y las boletas de pago."
      : searchParams?.error === "ya_finalizada"
        ? "La liquidacion ya fue finalizada y no admite cambios."
        : searchParams?.error === "sin_prorrateo"
          ? "No se puede finalizar: falta snapshot del Paso 3."
          : searchParams?.error === "expensas_con_cobranzas"
            ? "No se puede finalizar: existen expensas con cobranzas registradas."
            : searchParams?.error === "expensas_no_editables"
              ? "No se puede finalizar: existen expensas en estado no editable."
              : searchParams?.error === "liquidacion_inexistente"
                ? "La liquidacion no existe."
                : null;

  if (initialGate) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-semibold">Generacion de rendicion del mes</h1>
          <p className="mt-3 text-sm text-slate-700">Ultimo paso antes de finalizar la liquidacion y enviar la rendicion.</p>
          <p className="mt-1 text-sm text-slate-700">Revisa la informacion generada y, si es necesario, completa las secciones editables.</p>
          <p className="mt-1 text-sm text-slate-700">Podras previsualizar la rendicion en PDF antes de terminar.</p>
          <p className="mt-1 text-sm font-medium text-slate-900">Recorda que una vez que lo finalices, el cierre de mes no se puede deshacer.</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/liquidaciones/${liquidacion.id}/wizard/paso-4/preview`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              PREVISUALIZAR RENDICION EN PDF
            </Link>
            <Link href={`/liquidaciones/${liquidacion.id}/wizard/paso-4?continuar=1`} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              CONTINUAR
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/liquidaciones/${liquidacion.id}/wizard/paso-3`} className="text-blue-600 hover:underline">Volver al Paso 3</Link>
        <p className="mt-2 text-sm font-semibold text-slate-500">MIS EXPENSAS</p>
        <h1 className="text-2xl font-semibold">Generacion de rendicion del mes</h1>
        <p className="mt-1 text-sm text-slate-600">Mes de liquidacion (cierre): {formatPeriodoLabel(liquidacion.mesRendicion ?? liquidacion.periodo)}</p>
        <p className="text-sm text-slate-600">Mes de vencimiento de las expensas: {formatPeriodoLabel(liquidacion.mesVencimiento)}</p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 1</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 2</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 3</div>
        <div className="rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white">PASO 4</div>
      </section>

      <div className="mb-4">
        <Link href={`/liquidaciones/${liquidacion.id}/wizard/paso-4/preview`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          PREVISUALIZAR RENDICION EN PDF
        </Link>
      </div>

      {message ? (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>
      ) : null}

      {data.liquidacion.archivos.length > 0 ? (
        <section className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">Archivos generados</p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.liquidacion.archivos.map((archivo) => (
              <li key={archivo.id}>
                <a href={archivo.rutaArchivo} target="_blank" rel="noreferrer" className="text-emerald-800 underline hover:text-emerald-900">
                  {archivo.tipoArchivo === "RENDICION" ? "Rendicion final PDF" : `Boleta - ${archivo.nombreArchivo}`}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div dangerouslySetInnerHTML={{ __html: buildPaso4PreviewStyles() }} />

      <form id="paso4-textos-form" action={guardarTextos} className="space-y-3">
        <input type="hidden" name="liquidacionId" value={liquidacion.id} />

        <details className="rounded-lg border border-slate-200 bg-white" open>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">1) Datos de la administracion y el consorcio</summary>
          <div className="border-t border-slate-200 px-4 py-4" dangerouslySetInnerHTML={{ __html: previewSections.seccion1AdminConsorcio }} />
        </details>

        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">2) Detalle de gastos, ingresos y saldos del mes</summary>
          <div className="border-t border-slate-200 p-4" dangerouslySetInnerHTML={{ __html: previewSections.seccion2DetalleGastos }} />
        </details>

        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">3) Estado de cuentas y prorrateo</summary>
          <div className="border-t border-slate-200 p-4" dangerouslySetInnerHTML={{ __html: previewSections.seccion3Prorrateo }} />
        </details>

        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">4) Listado de morosos</summary>
          <div className="border-t border-slate-200 p-4" dangerouslySetInnerHTML={{ __html: previewSections.seccion4SaldosPendientes }} />
        </details>

        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">5) Listado de proveedores</summary>
          <div className="border-t border-slate-200 p-4" dangerouslySetInnerHTML={{ __html: previewSections.seccion5Proveedores }} />
        </details>

        <details className="rounded-lg border border-slate-200 bg-white" open>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">6) Datos de juicios (editable)</summary>
          <div className="border-t border-slate-200 p-4">
            <textarea name="datosJuicios" defaultValue={liquidacion.datosJuicios ?? ""} className="min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} />
          </div>
        </details>

        <details className="rounded-lg border border-slate-200 bg-white" open>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">7) Recomendaciones generales y permanentes (editable)</summary>
          <div className="border-t border-slate-200 p-4">
            <textarea name="recomendacionesGenerales" defaultValue={liquidacion.recomendacionesGenerales ?? ""} className="min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} />
          </div>
        </details>

        <details className="rounded-lg border border-slate-200 bg-white" open>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">8) Novedades del mes (editable)</summary>
          <div className="border-t border-slate-200 p-4">
            <textarea name="novedadesMes" defaultValue={liquidacion.novedadesMes ?? ""} className="min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} />
          </div>
        </details>

        <div className="mt-6">
          <button type="submit" disabled={!canEdit} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">GUARDAR CAMBIOS</button>
        </div>
      </form>

      <section className="mt-3 flex flex-wrap items-center gap-3">
        <form action={deshacerLiquidacion}>
          <button type="submit" disabled={!canEdit} className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">DESHACER LIQUIDACION</button>
        </form>

        {canEdit ? (
          <RegenerarArchivosButton
            liquidacionId={liquidacion.id}
            endpoint={`/api/liquidaciones/${liquidacion.id}/finalizar-liquidacion`}
            label="FINALIZAR: ENVIAR RENDICION Y VOLANTES DE PAGO"
            confirmMessage="Se finalizara la liquidacion y se generaran rendicion y volantes de pago. Queres continuar?"
            modalTitle="Finalizando liquidacion"
            successMessage="Liquidacion finalizada correctamente. Se generaron los documentos."
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            completeAction="refresh"
            payloadFromFormId="paso4-textos-form"
            payloadFieldNames={["liquidacionId", "datosJuicios", "recomendacionesGenerales", "novedadesMes"]}
          />
        ) : (
          <button type="button" disabled className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white opacity-60">FINALIZAR: ENVIAR RENDICION Y VOLANTES DE PAGO</button>
        )}
      </section>
    </main>
  );
}





