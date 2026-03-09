import { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

import LiquidacionPaso1Form from "../../_components/LiquidacionPaso1Form";
import { getActiveConsorcioContext } from "../../../../lib/consorcio-activo";
import { requireConsorcioRole } from "../../../../lib/auth";
import { getCurrentPeriodo, getPeriodoVariants, normalizePeriodo } from "../../../../lib/periodo";
import { prisma } from "../../../../lib/prisma";

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

function toDateInput(date: Date) {
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

export default async function LiquidacionWizardPaso1NuevaPage({
  searchParams,
}: {
  searchParams?: { error?: string; periodo?: string };
}) {
  const { access, consorcios, activeConsorcioId } = await getActiveConsorcioContext();

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Liquidacion - Paso 1</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">No hay consorcio activo valido.</p>
      </main>
    );
  }

  if (!access.isSuperAdmin && !access.allowedConsorcioIds.includes(activeConsorcioId)) {
    redirect("/liquidaciones");
  }

  const assignmentRole = access.isSuperAdmin
    ? "ADMIN"
    : access.assignments.find((a) => a.consorcioId === activeConsorcioId)?.role;

  const canOperate = access.isSuperAdmin || assignmentRole === "ADMIN" || assignmentRole === "OPERADOR";
  if (!canOperate) {
    redirect("/liquidaciones");
  }

  const consorcio = consorcios.find((c) => c.id === activeConsorcioId);

  const now = new Date();
  const mesVencimiento = getCurrentPeriodo();
  const mesRendicionDefault = getPreviousMonthPeriodo(now);
  const mesRendicion = normalizePeriodo(searchParams?.periodo ?? "") ?? mesRendicionDefault;

  const ultimaLiquidacion = await prisma.liquidacion.findFirst({
    where: { consorcioId: activeConsorcioId },
    orderBy: [{ fechaEmision: "desc" }, { id: "desc" }],
    select: {
      id: true,
      fechaVencimiento: true,
      tasaInteresMensual: true,
      montoFondoReserva: true,
    },
  });

  const gastos = await prisma.gasto.findMany({
    where: {
      consorcioId: activeConsorcioId,
      periodo: { in: getPeriodoVariants(mesRendicion) },
    },
    select: { tipoExpensa: true, monto: true },
  });

  const montoOrdinarias = gastos
    .filter((g) => g.tipoExpensa === "ORDINARIA")
    .reduce((acc, g) => acc + g.monto, 0);
  const montoExtraordinarias = gastos
    .filter((g) => g.tipoExpensa === "EXTRAORDINARIA")
    .reduce((acc, g) => acc + g.monto, 0);

  const fechaVencDefault = ultimaLiquidacion?.fechaVencimiento
    ? moveDateToPeriodoKeepingDay(ultimaLiquidacion.fechaVencimiento, mesVencimiento)
    : new Date(`${mesVencimiento}-10T00:00:00`);

  async function confirmarPaso1(formData: FormData) {
    "use server";

    if (activeConsorcioId === null) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(activeConsorcioId, ["ADMIN", "OPERADOR"]);

    const mesRendicionValue = normalizePeriodo((formData.get("mesRendicion")?.toString() ?? "").trim());
    const mesVencimientoValue = normalizePeriodo((formData.get("mesVencimiento")?.toString() ?? "").trim());

    if (!mesRendicionValue || !mesVencimientoValue) {
      redirect("/liquidaciones/wizard/paso-1?error=periodo_invalido");
    }

    const montoFondoReserva = parseMoneyAmount(formData.get("montoFondoReserva"));
    const montoOrdinariasValue = parseMoneyAmount(formData.get("montoOrdinarias"));
    const montoExtraordinariasValue = parseMoneyAmount(formData.get("montoExtraordinarias"));
    const total = Math.round((montoFondoReserva + montoOrdinariasValue + montoExtraordinariasValue + Number.EPSILON) * 100) / 100;

    const fechaVencRaw = (formData.get("fechaVencimiento")?.toString() ?? "").trim();
    if (!fechaVencRaw) {
      redirect("/liquidaciones/wizard/paso-1?error=vencimiento_requerido");
    }

    const fechaVencimiento = parseCalendarDateInput(fechaVencRaw);
    if (!fechaVencimiento) {
      redirect("/liquidaciones/wizard/paso-1?error=vencimiento_requerido");
    }

    const tasaRaw = (formData.get("tasaInteresMensual")?.toString() ?? "").trim();
    const tasaInteresMensual = tasaRaw ? Number(tasaRaw) : null;
    if (tasaRaw && Number.isNaN(tasaInteresMensual)) {
      redirect("/liquidaciones/wizard/paso-1?error=tasa_invalida");
    }

    try {
      const liquidacion = await prisma.liquidacion.create({
        data: {
          consorcioId: activeConsorcioId,
          periodo: mesRendicionValue,
          mesRendicion: mesRendicionValue,
          mesVencimiento: mesVencimientoValue,
          montoFondoReserva,
          montoOrdinarias: montoOrdinariasValue,
          montoExtraordinarias: montoExtraordinariasValue,
          tasaInteresMensual,
          fechaVencimiento,
          total,
          estado: "BORRADOR",
          wizardPasoActual: 2,
        },
      });

      redirect(`/liquidaciones/${liquidacion.id}/wizard/paso-2`);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect(`/liquidaciones/wizard/paso-1?periodo=${mesRendicionValue}&error=duplicada`);
      }
      throw error;
    }
  }

  const errorMessage =
    searchParams?.error === "periodo_invalido"
      ? "Mes de rendicion o vencimiento invalido."
      : searchParams?.error === "vencimiento_requerido"
        ? "La fecha de vencimiento es obligatoria."
        : searchParams?.error === "tasa_invalida"
          ? "La tasa de interes mensual no es valida."
          : searchParams?.error === "duplicada"
            ? "Ya existe una liquidacion para ese mes de rendicion en este consorcio."
            : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link href="/liquidaciones/nueva" className="text-blue-600 hover:underline">
            Volver
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Liquidacion de expensas: Definicion de montos a liquidar</h1>
          <p className="mt-1 text-sm text-slate-600">Consorcio activo: {consorcio?.nombre ?? `#${activeConsorcioId}`}</p>
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
        <p className="text-sm text-slate-600">
          Defini los montos base de la liquidacion para el periodo de rendicion y confirma para continuar al Paso 2.
        </p>
      </section>

      <LiquidacionPaso1Form
        mesRendicionLabel={formatPeriodoLabel(mesRendicion)}
        mesVencimientoLabel={formatPeriodoLabel(mesVencimiento)}
        mesRendicionValue={mesRendicion}
        mesVencimientoValue={mesVencimiento}
        initialFondoReserva={ultimaLiquidacion?.montoFondoReserva ?? 0}
        initialOrdinarias={montoOrdinarias}
        initialExtraordinarias={montoExtraordinarias}
        initialFechaVencimiento={toDateInput(fechaVencDefault)}
        initialTasaInteres={ultimaLiquidacion?.tasaInteresMensual?.toString() ?? ""}
        previousFondoReserva={ultimaLiquidacion?.montoFondoReserva ?? null}
        previousTasaInteres={ultimaLiquidacion?.tasaInteresMensual ?? null}
        gestionGastosHref={`/gastos?consorcioId=${activeConsorcioId}&periodo=${mesRendicion}`}
        submitLabel="Confirmar montos y continuar"
        action={confirmarPaso1}
      />
    </main>
  );
}



