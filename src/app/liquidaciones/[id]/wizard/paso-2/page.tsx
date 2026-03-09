import Link from "next/link";
import { redirect } from "next/navigation";

import LiquidacionPaso2Form from "../../../_components/LiquidacionPaso2Form";
import { getAccessContext, requireConsorcioAccess, requireConsorcioRole } from "../../../../../lib/auth";
import {
  calcularImportePorCriterio,
  calcularInteresCapitalizadoPorTasas,
  type CriterioDeuda,
  type LiquidacionTasa,
} from "../../../../../lib/liquidacion-deudas";
import { normalizePeriodo } from "../../../../../lib/periodo";
import { prisma } from "../../../../../lib/prisma";

type DeudaElegible = {
  expensaId: number;
  unidad: string;
  propietario: string;
  mesCierre: string;
  mesVencimiento: string;
  capital: number;
  interes: number;
};

function formatPeriodoLabel(periodo: string) {
  const normalized = normalizePeriodo(periodo);
  if (!normalized) {
    return periodo;
  }

  const [year, month] = normalized.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
}

function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateInput(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function getOwnerLabel(relaciones: Array<{ desde: Date; hasta: Date | null; persona: { nombre: string; apellido: string } }>) {
  if (relaciones.length === 0) {
    return "-";
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vigente = relaciones.find((rel) => rel.desde <= hoy && (!rel.hasta || rel.hasta >= hoy));
  const chosen = vigente ?? relaciones[0];

  return `${chosen.persona.apellido}, ${chosen.persona.nombre}`;
}

function buildUnidadLabel(unidad: {
  identificador: string;
  tipo: string;
  piso: string | null;
  departamento: string | null;
}) {
  const parts = [`${unidad.identificador} (${unidad.tipo})`];

  if (unidad.piso) {
    parts.push(`Piso ${unidad.piso}`);
  }

  if (unidad.departamento) {
    parts.push(`Depto ${unidad.departamento}`);
  }

  return parts.join(" / ");
}

async function buildDeudasElegibles(params: {
  liquidacionId: number;
  consorcioId: number;
  periodoLiquidacion: string;
  fechaCalculoInteres: Date;
  tasasHistoricas: LiquidacionTasa[];
}): Promise<DeudaElegible[]> {
  const { liquidacionId, consorcioId, periodoLiquidacion, fechaCalculoInteres, tasasHistoricas } = params;

  const expensas = await prisma.expensa.findMany({
    where: {
      estado: { in: ["PENDIENTE", "PARCIAL"] },
      unidad: { consorcioId },
      liquidacionId: { not: liquidacionId },
    },
    include: {
      liquidacion: {
        select: {
          id: true,
          periodo: true,
          mesVencimiento: true,
          fechaVencimiento: true,
          fechaEmision: true,
        },
      },
      unidad: {
        select: {
          identificador: true,
          tipo: true,
          piso: true,
          departamento: true,
          personas: {
            include: {
              persona: { select: { nombre: true, apellido: true } },
            },
            orderBy: [{ desde: "desc" }, { persona: { apellido: "asc" } }],
          },
        },
      },
    },
    orderBy: [{ liquidacion: { periodo: "asc" } }, { unidadId: "asc" }],
  });

  const periodoActual = normalizePeriodo(periodoLiquidacion);

  return expensas
    .filter((expensa) => {
      const periodoDeuda = normalizePeriodo(expensa.liquidacion.periodo);

      if (!periodoActual || !periodoDeuda) {
        const referencia = new Date(`${periodoActual ?? periodoLiquidacion}-01T00:00:00`);
        return expensa.liquidacion.fechaEmision < referencia;
      }

      return periodoDeuda < periodoActual;
    })
    .map((expensa) => {
      const capital = expensa.saldo;
      const fechaVencimientoBase = expensa.liquidacion.fechaVencimiento ?? expensa.liquidacion.fechaEmision;
      const interes = calcularInteresCapitalizadoPorTasas({
        capital,
        fechaVencimientoDeuda: fechaVencimientoBase,
        fechaCalculo: fechaCalculoInteres,
        tasasHistoricas,
      }).interes;

      const mesCierreNorm = normalizePeriodo(expensa.liquidacion.periodo) ?? expensa.liquidacion.periodo;
      const mesVencNorm =
        normalizePeriodo(expensa.liquidacion.mesVencimiento ?? expensa.liquidacion.periodo) ??
        (expensa.liquidacion.mesVencimiento ?? expensa.liquidacion.periodo);

      return {
        expensaId: expensa.id,
        unidad: buildUnidadLabel(expensa.unidad),
        propietario: getOwnerLabel(expensa.unidad.personas),
        mesCierre: mesCierreNorm,
        mesVencimiento: mesVencNorm,
        capital,
        interes,
      };
    });
}

export default async function LiquidacionWizardPaso2Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; fechaLiquidacionDeudas?: string };
}) {
  const id = Number(params.id);

  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id },
    include: {
      consorcio: { select: { id: true, nombre: true } },
    },
  });

  if (!liquidacion) {
    return <div className="p-6">Liquidacion no encontrada</div>;
  }

  await requireConsorcioAccess(liquidacion.consorcioId);

  const access = await getAccessContext();
  const assignmentRole = access.isSuperAdmin
    ? "ADMIN"
    : access.assignments.find((a) => a.consorcioId === liquidacion.consorcioId)?.role;

  const canOperate = access.isSuperAdmin || assignmentRole === "ADMIN" || assignmentRole === "OPERADOR";

  if (!canOperate) {
    redirect(`/liquidaciones/${liquidacion.id}`);
  }

  const fechaCalculo = parseDateInput(searchParams?.fechaLiquidacionDeudas) ?? new Date();

  const tasasHistoricas = await prisma.liquidacion.findMany({
    where: {
      consorcioId: liquidacion.consorcioId,
      fechaVencimiento: { not: null },
      tasaInteresMensual: { not: null },
    },
    orderBy: [{ fechaVencimiento: "asc" }, { id: "asc" }],
    select: {
      fechaVencimiento: true,
      tasaInteresMensual: true,
    },
  });

  const deudas = await buildDeudasElegibles({
    liquidacionId: liquidacion.id,
    consorcioId: liquidacion.consorcioId,
    periodoLiquidacion: liquidacion.periodo,
    fechaCalculoInteres: fechaCalculo,
    tasasHistoricas: tasasHistoricas.map((t) => ({
      fechaVencimiento: t.fechaVencimiento!,
      tasaInteresMensual: t.tasaInteresMensual,
    })),
  });

  async function deshacerLiquidacion(formData: FormData) {
    "use server";

    const liquidacionId = Number(formData.get("liquidacionId"));

    const actual = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      select: { id: true, consorcioId: true, estado: true },
    });

    if (!actual) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(actual.consorcioId, ["ADMIN", "OPERADOR"]);

    if (actual.estado !== "BORRADOR") {
      redirect(`/liquidaciones/${actual.id}/wizard/paso-2?error=estado_no_borrador`);
    }

    const pagosCount = await prisma.pago.count({
      where: {
        expensa: { liquidacionId: actual.id },
      },
    });

    if (pagosCount > 0) {
      redirect(`/liquidaciones/${actual.id}/wizard/paso-2?error=con_cobranzas`);
    }

    await prisma.liquidacion.delete({ where: { id: actual.id } });
    redirect("/liquidaciones");
  }

  async function liquidarDeudasYContinuar(formData: FormData) {
    "use server";

    const liquidacionId = Number(formData.get("liquidacionId"));
    const fechaRaw = formData.get("fechaCalculoInteres")?.toString() ?? "";
    const fechaCalculoInteres = parseDateInput(fechaRaw);

    if (!fechaCalculoInteres) {
      redirect(`/liquidaciones/${liquidacionId}/wizard/paso-2?error=fecha_invalida`);
    }

    const actual = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      select: { id: true, consorcioId: true, periodo: true, estado: true },
    });

    if (!actual) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(actual.consorcioId, ["ADMIN", "OPERADOR"]);

    if (actual.estado !== "BORRADOR") {
      redirect(`/liquidaciones/${actual.id}/wizard/paso-2?error=estado_no_borrador`);
    }

    const selectedExpensaIds = formData
      .getAll("selectedExpensaIds")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);

    const timeline = await prisma.liquidacion.findMany({
      where: {
        consorcioId: actual.consorcioId,
        fechaVencimiento: { not: null },
        tasaInteresMensual: { not: null },
      },
      orderBy: [{ fechaVencimiento: "asc" }, { id: "asc" }],
      select: { fechaVencimiento: true, tasaInteresMensual: true },
    });

    const deudasActuales = await buildDeudasElegibles({
      liquidacionId: actual.id,
      consorcioId: actual.consorcioId,
      periodoLiquidacion: actual.periodo,
      fechaCalculoInteres,
      tasasHistoricas: timeline.map((t) => ({
        fechaVencimiento: t.fechaVencimiento!,
        tasaInteresMensual: t.tasaInteresMensual,
      })),
    });

    const deudasMap = new Map<number, DeudaElegible>();
    for (const deuda of deudasActuales) {
      deudasMap.set(deuda.expensaId, deuda);
    }

    const selectedRows = selectedExpensaIds
      .map((idValue) => deudasMap.get(idValue))
      .filter((item): item is DeudaElegible => Boolean(item));

    const rowsToCreate: Array<{
      liquidacionId: number;
      expensaId: number;
      capitalOriginal: number;
      interesCalculado: number;
      criterio: string;
      importeLiquidado: number;
      fechaCalculoInteres: Date;
    }> = [];

    for (const deuda of selectedRows) {
      const criterioRaw = (formData.get(`criterio_${deuda.expensaId}`)?.toString() ?? "TOTAL").trim();
      const criterio = (
        criterioRaw === "TOTAL" ||
        criterioRaw === "CAPITAL" ||
        criterioRaw === "INTERES" ||
        criterioRaw === "PARCIAL"
          ? criterioRaw
          : null
      ) as CriterioDeuda | null;

      if (!criterio) {
        redirect(
          `/liquidaciones/${actual.id}/wizard/paso-2?error=criterio_invalido&fechaLiquidacionDeudas=${toDateInput(fechaCalculoInteres)}`,
        );
      }

      const parcialRaw = formData.get(`parcial_${deuda.expensaId}`)?.toString() ?? "";
      const parcial = parcialRaw.trim() ? Number(parcialRaw) : null;

      const importe = calcularImportePorCriterio({
        capital: deuda.capital,
        interes: deuda.interes,
        criterio,
        parcial,
      });

      if (importe === null) {
        redirect(
          `/liquidaciones/${actual.id}/wizard/paso-2?error=parcial_invalido&fechaLiquidacionDeudas=${toDateInput(fechaCalculoInteres)}`,
        );
      }

      rowsToCreate.push({
        liquidacionId: actual.id,
        expensaId: deuda.expensaId,
        capitalOriginal: deuda.capital,
        interesCalculado: deuda.interes,
        criterio,
        importeLiquidado: importe,
        fechaCalculoInteres,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.liquidacionDeuda.deleteMany({ where: { liquidacionId: actual.id } });

      if (rowsToCreate.length > 0) {
        await tx.liquidacionDeuda.createMany({ data: rowsToCreate });
      }

      await tx.liquidacion.update({
        where: { id: actual.id },
        data: { wizardPasoActual: 3 },
      });
    });

    redirect(`/liquidaciones/${actual.id}/wizard/paso-3`);
  }

  const errorMessage =
    searchParams?.error === "fecha_invalida"
        ? "La fecha de liquidacion de deudas no es valida."
        : searchParams?.error === "criterio_invalido"
          ? "Se detecto un criterio de imputacion invalido."
          : searchParams?.error === "parcial_invalido"
            ? "El importe parcial debe ser mayor a 0 y no superar el total de la deuda."
            : searchParams?.error === "estado_no_borrador"
              ? "Solo se puede operar el Paso 2 sobre liquidaciones en BORRADOR."
              : searchParams?.error === "con_cobranzas"
                ? "No se puede deshacer: la liquidacion ya tiene cobranzas registradas."
                : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/liquidaciones/${liquidacion.id}/wizard/paso-1`} className="text-blue-600 hover:underline">
          Volver al Paso 1
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Liquidacion de expensas: Liquidacion de deudas</h1>
        <p className="mt-1 text-sm text-slate-600">Consorcio: {liquidacion.consorcio.nombre}</p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 1</div>
        <div className="rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white">PASO 2</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 3</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 4</div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p>
          Se listan deudas de periodos anteriores al cierre actual ({formatPeriodoLabel(normalizePeriodo(liquidacion.periodo) ?? liquidacion.periodo)}).
          El interes se calcula de forma capitalizada usando las tasas historicas de liquidaciones desde el vencimiento original de cada deuda.
        </p>
      </section>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <LiquidacionPaso2Form
        liquidacionId={liquidacion.id}
        fechaLiquidacionDeudas={toDateInput(fechaCalculo)}
        deudas={deudas.map((d) => ({
          ...d,
          mesCierre: formatPeriodoLabel(d.mesCierre),
          mesVencimiento: formatPeriodoLabel(d.mesVencimiento),
        }))}
        action={liquidarDeudasYContinuar}
        deshacerAction={deshacerLiquidacion}
        volverHref={`/liquidaciones/${liquidacion.id}/wizard/paso-1`}
      />
    </main>
  );
}


