import Link from "next/link";
import { redirect } from "next/navigation";

import LiquidacionPaso1Form from "../../../_components/LiquidacionPaso1Form";
import { getAccessContext, requireConsorcioAccess, requireConsorcioRole } from "../../../../../lib/auth";
import { getCurrentPeriodo, getPeriodoVariants, normalizePeriodo } from "../../../../../lib/periodo";
import { prisma } from "../../../../../lib/prisma";

function periodoToDate(periodo: string) {
  return new Date(`${periodo}-01T00:00:00`);
}

function formatPeriodoLabel(periodo: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(periodoToDate(periodo));
}

function getPreviousMonthPeriodo(base: Date) {
  const d = new Date(base);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function moveDateToPeriodoKeepingDay(source: Date, targetPeriodo: string) {
  const [yearStr, monthStr] = targetPeriodo.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = source.getDate();
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(year, month - 1, safeDay);
}

function toDateInput(date: Date | null) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseCalendarDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseMoneyAmount(value: FormDataEntryValue | null) {
  const raw = value?.toString().trim() ?? "";
  if (!raw) return 0;

  const normalized = raw.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;

  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export default async function LiquidacionWizardPaso1EditPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
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

  const now = new Date();
  const mesVencimientoDefault = getCurrentPeriodo();
  const mesRendicionDefault = getPreviousMonthPeriodo(now);

  const mesRendicion = liquidacion.mesRendicion ?? normalizePeriodo(liquidacion.periodo) ?? mesRendicionDefault;
  const mesVencimiento = liquidacion.mesVencimiento ?? mesVencimientoDefault;

  const previousLiquidacion = await prisma.liquidacion.findFirst({
    where: {
      consorcioId: liquidacion.consorcioId,
      id: { not: liquidacion.id },
    },
    orderBy: [{ fechaEmision: "desc" }, { id: "desc" }],
    select: {
      montoFondoReserva: true,
      tasaInteresMensual: true,
      fechaVencimiento: true,
    },
  });

  const gastosPeriodo = await prisma.gasto.findMany({
    where: {
      consorcioId: liquidacion.consorcioId,
      periodo: { in: getPeriodoVariants(mesRendicion) },
    },
    select: { tipoExpensa: true, monto: true },
  });

  const defaultsOrdinarias = gastosPeriodo
    .filter((g) => g.tipoExpensa === "ORDINARIA")
    .reduce((acc, g) => acc + g.monto, 0);
  const defaultsExtraordinarias = gastosPeriodo
    .filter((g) => g.tipoExpensa === "EXTRAORDINARIA")
    .reduce((acc, g) => acc + g.monto, 0);

  const fallbackFechaVenc = previousLiquidacion?.fechaVencimiento
    ? moveDateToPeriodoKeepingDay(previousLiquidacion.fechaVencimiento, mesVencimiento)
    : new Date(`${mesVencimiento}-10T00:00:00`);

  async function confirmarPaso1(formData: FormData) {
    "use server";

    const liquidacionActual = await prisma.liquidacion.findUnique({
      where: { id: liquidacion.id },
      select: { id: true, consorcioId: true },
    });

    if (!liquidacionActual) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(liquidacionActual.consorcioId, ["ADMIN", "OPERADOR"]);

    const mesRendicionValue = normalizePeriodo((formData.get("mesRendicion")?.toString() ?? "").trim());
    const mesVencimientoValue = normalizePeriodo((formData.get("mesVencimiento")?.toString() ?? "").trim());

    if (!mesRendicionValue || !mesVencimientoValue) {
      redirect(`/liquidaciones/${liquidacion.id}/wizard/paso-1?error=periodo_invalido`);
    }

    const montoFondoReserva = parseMoneyAmount(formData.get("montoFondoReserva"));
    const montoOrdinarias = parseMoneyAmount(formData.get("montoOrdinarias"));
    const montoExtraordinarias = parseMoneyAmount(formData.get("montoExtraordinarias"));
    const total = Math.round((montoFondoReserva + montoOrdinarias + montoExtraordinarias + Number.EPSILON) * 100) / 100;

    const fechaVencRaw = (formData.get("fechaVencimiento")?.toString() ?? "").trim();
    if (!fechaVencRaw) {
      redirect(`/liquidaciones/${liquidacion.id}/wizard/paso-1?error=vencimiento_requerido`);
    }

    const fechaVencimiento = parseCalendarDateInput(fechaVencRaw);
    if (!fechaVencimiento) {
      redirect(`/liquidaciones/${liquidacion.id}/wizard/paso-1?error=vencimiento_requerido`);
    }

    const tasaRaw = (formData.get("tasaInteresMensual")?.toString() ?? "").trim();
    const tasaInteresMensual = tasaRaw ? Number(tasaRaw) : null;
    if (tasaRaw && Number.isNaN(tasaInteresMensual)) {
      redirect(`/liquidaciones/${liquidacion.id}/wizard/paso-1?error=tasa_invalida`);
    }

    await prisma.liquidacion.update({
      where: { id: liquidacionActual.id },
      data: {
        mesRendicion: mesRendicionValue,
        mesVencimiento: mesVencimientoValue,
        montoFondoReserva,
        montoOrdinarias,
        montoExtraordinarias,
        tasaInteresMensual,
        fechaVencimiento,
        total,
        wizardPasoActual: 2,
      },
    });

    redirect(`/liquidaciones/${liquidacionActual.id}/wizard/paso-2`);
  }

  const errorMessage =
    searchParams?.error === "periodo_invalido"
      ? "Mes de rendicion o vencimiento invalido."
      : searchParams?.error === "vencimiento_requerido"
        ? "La fecha de vencimiento es obligatoria."
        : searchParams?.error === "tasa_invalida"
          ? "La tasa de interes mensual no es valida."
          : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link href={`/liquidaciones/${liquidacion.id}/editar`} className="text-blue-600 hover:underline">
            Volver
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Liquidacion de expensas: Definicion de montos a liquidar</h1>
          <p className="mt-1 text-sm text-slate-600">Consorcio: {liquidacion.consorcio.nombre}</p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <div className="rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white">PASO 1</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 2</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 3</div>
        <div className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">PASO 4</div>
      </section>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Edita los montos y parametros de Fase 1 para esta liquidacion y continua al Paso 2.</p>
      </section>

      <LiquidacionPaso1Form
        mesRendicionLabel={formatPeriodoLabel(mesRendicion)}
        mesVencimientoLabel={formatPeriodoLabel(mesVencimiento)}
        mesRendicionValue={mesRendicion}
        mesVencimientoValue={mesVencimiento}
        initialFondoReserva={liquidacion.montoFondoReserva ?? previousLiquidacion?.montoFondoReserva ?? 0}
        initialOrdinarias={liquidacion.montoOrdinarias ?? defaultsOrdinarias}
        initialExtraordinarias={liquidacion.montoExtraordinarias ?? defaultsExtraordinarias}
        initialFechaVencimiento={toDateInput(liquidacion.fechaVencimiento ?? fallbackFechaVenc)}
        initialTasaInteres={
          liquidacion.tasaInteresMensual !== null && liquidacion.tasaInteresMensual !== undefined
            ? liquidacion.tasaInteresMensual.toString()
            : previousLiquidacion?.tasaInteresMensual?.toString() ?? ""
        }
        previousFondoReserva={previousLiquidacion?.montoFondoReserva ?? null}
        previousTasaInteres={previousLiquidacion?.tasaInteresMensual ?? null}
        gestionGastosHref={`/gastos?consorcioId=${liquidacion.consorcioId}&periodo=${mesRendicion}`}
        submitLabel="Confirmar montos y continuar"
        action={confirmarPaso1}
      />
    </main>
  );
}




