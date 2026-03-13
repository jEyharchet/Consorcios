import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { requireConsorcioRole } from "../../../lib/auth";
import { redirectToOnboardingIfNoConsorcios } from "../../../lib/onboarding";
import { getActiveConsorcioContext } from "../../../lib/consorcio-activo";
import { getPeriodoVariants, normalizePeriodo } from "../../../lib/periodo";
import { prisma } from "../../../lib/prisma";
import { normalizeDate } from "../../../lib/relaciones";

const TIPOS_EXPENSA = ["ORDINARIA", "EXTRAORDINARIA"] as const;
const RUBROS = [
  "Sueldos y Cargas Sociales",
  "Servicios Publicos",
  "Abonos",
  "Mantenimiento General",
  "Gastos Bancarios",
  "Gastos de Limpieza",
  "Gastos de Administracion",
  "Seguros",
  "Otros",
] as const;

async function createGastoWithSequenceRecovery(data: {
  consorcioId: number;
  proveedorId: number | null;
  fecha: Date;
  periodo: string;
  concepto: string;
  descripcion: string | null;
  tipoExpensa: string;
  rubroExpensa: string;
  monto: number;
}) {
  try {
    return await prisma.gasto.create({ data });
  } catch (error) {
    const target = (error instanceof Prisma.PrismaClientKnownRequestError
      ? (error.meta as { target?: unknown } | undefined)?.target
      : undefined);
    const targetIncludesId =
      (Array.isArray(target) && target.includes("id")) ||
      (typeof target === "string" && target.includes("id"));
    const isDuplicatedId =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      targetIncludesId;

    if (!isDuplicatedId) {
      throw error;
    }

    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"Gasto"', 'id'),
        COALESCE((SELECT MAX(id) FROM "Gasto"), 1),
        true
      );
    `);

    return prisma.gasto.create({ data });
  }
}

export default async function NuevoGastoPage({
  searchParams,
}: {
  searchParams?: { consorcioId?: string; error?: string };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);
  const canManage =
    access.isSuperAdmin || access.assignments.some((assignment) => assignment.role === "ADMIN" || assignment.role === "OPERADOR");

  const initialConsorcioIdParam = (searchParams?.consorcioId ?? "").trim();
  const selectedConsorcioParam = initialConsorcioIdParam || (activeConsorcioId ? String(activeConsorcioId) : "");
  const parsedSelectedConsorcioId = selectedConsorcioParam ? Number(selectedConsorcioParam) : null;
  const selectedConsorcioId =
    parsedSelectedConsorcioId && Number.isInteger(parsedSelectedConsorcioId) && parsedSelectedConsorcioId > 0
      ? parsedSelectedConsorcioId
      : null;

  if (!canManage) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No tenes permisos para crear gastos.
        </p>
      </main>
    );
  }

  redirectToOnboardingIfNoConsorcios(access);

  const [consorcios, proveedores] = await Promise.all([
    prisma.consorcio.findMany({
      where: access.isSuperAdmin ? undefined : { id: { in: access.allowedConsorcioIds } },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
    prisma.proveedor.findMany({
      where: selectedConsorcioId
        ? {
            consorcios: {
              some: {
                consorcioId: selectedConsorcioId,
              },
            },
          }
        : undefined,
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  async function crearGasto(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    const fechaRaw = (formData.get("fecha")?.toString() ?? "").trim();
    const periodoRaw = (formData.get("periodo")?.toString() ?? "").trim();
    const concepto = (formData.get("concepto")?.toString() ?? "").trim();
    const descripcionRaw = (formData.get("descripcion")?.toString() ?? "").trim();
    const tipoExpensa = (formData.get("tipoExpensa")?.toString() ?? "").trim();
    const rubroExpensa = (formData.get("rubroExpensa")?.toString() ?? "").trim();
    const proveedorIdRaw = (formData.get("proveedorId")?.toString() ?? "").trim();
    const montoRaw = (formData.get("monto")?.toString() ?? "").trim();

    if (!consorcioId) redirect("/gastos/nuevo?error=consorcio_requerido");
    if (!fechaRaw) redirect(`/gastos/nuevo?error=fecha_requerida&consorcioId=${consorcioId}`);
    if (!periodoRaw) redirect(`/gastos/nuevo?error=periodo_requerido&consorcioId=${consorcioId}`);
    if (!concepto) redirect(`/gastos/nuevo?error=concepto_requerido&consorcioId=${consorcioId}`);
    if (!tipoExpensa) redirect(`/gastos/nuevo?error=tipo_requerido&consorcioId=${consorcioId}`);
    if (!rubroExpensa) redirect(`/gastos/nuevo?error=rubro_requerido&consorcioId=${consorcioId}`);

    const periodo = normalizePeriodo(periodoRaw);
    if (!periodo) {
      redirect(`/gastos/nuevo?error=periodo_invalido&consorcioId=${consorcioId}`);
    }

    const fecha = new Date(fechaRaw);
    if (Number.isNaN(fecha.getTime())) {
      redirect(`/gastos/nuevo?error=fecha_requerida&consorcioId=${consorcioId}`);
    }

    const monto = Number(montoRaw);
    if (!montoRaw || Number.isNaN(monto) || monto <= 0) {
      redirect(`/gastos/nuevo?error=monto_invalido&consorcioId=${consorcioId}`);
    }

    const liquidacionCerrada = await prisma.liquidacion.findFirst({
      where: {
        consorcioId,
        periodo: { in: getPeriodoVariants(periodo) },
        estado: { in: ["EMITIDA", "CERRADA"] },
      },
      select: { id: true },
    });

    if (liquidacionCerrada) {
      redirect(`/gastos/nuevo?error=periodo_bloqueado&consorcioId=${consorcioId}`);
    }

    const proveedorId = proveedorIdRaw ? Number(proveedorIdRaw) : null;
    if (proveedorId) {
      const fechaNormalizada = normalizeDate(fecha);
      const proveedorHabilitado = await prisma.proveedorConsorcio.findFirst({
        where: {
          proveedorId,
          consorcioId,
          desde: { lte: fechaNormalizada },
          OR: [{ hasta: null }, { hasta: { gte: fechaNormalizada } }],
        },
        select: { id: true },
      });

      if (!proveedorHabilitado) {
        redirect(`/gastos/nuevo?error=proveedor_invalido&consorcioId=${consorcioId}`);
      }
    }

    await createGastoWithSequenceRecovery({
      consorcioId,
      proveedorId,
      fecha,
      periodo,
      concepto,
      descripcion: descripcionRaw || null,
      tipoExpensa,
      rubroExpensa,
      monto,
    });

    redirect("/gastos");
  }

  const errorMessage =
    searchParams?.error === "consorcio_requerido"
      ? "El consorcio es obligatorio."
      : searchParams?.error === "fecha_requerida"
        ? "La fecha es obligatoria."
        : searchParams?.error === "periodo_requerido"
          ? "El periodo es obligatorio."
          : searchParams?.error === "periodo_invalido"
            ? "El periodo debe tener formato YYYY-MM."
            : searchParams?.error === "concepto_requerido"
              ? "El concepto es obligatorio."
              : searchParams?.error === "tipo_requerido"
                ? "El tipo de expensa es obligatorio."
                : searchParams?.error === "rubro_requerido"
                  ? "El rubro es obligatorio."
                  : searchParams?.error === "monto_invalido"
                    ? "El monto debe ser mayor a 0."
                    : searchParams?.error === "proveedor_invalido"
                      ? "El proveedor debe estar asociado al mismo consorcio y vigente para la fecha del gasto."
                      : searchParams?.error === "periodo_bloqueado"
                        ? "No se puede registrar el gasto porque el periodo ya esta emitido o cerrado."
                        : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href="/gastos" className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Nuevo gasto</h1>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <form method="GET" className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">Filtrar proveedores por consorcio</label>
        <div className="flex gap-2">
          <select name="consorcioId" defaultValue={selectedConsorcioParam} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Seleccionar consorcio</option>
            {consorcios.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Aplicar</button>
        </div>
      </form>

      <form action={crearGasto} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="space-y-1">
          <label htmlFor="consorcioId" className="text-sm font-medium text-slate-700">Consorcio</label>
          <select id="consorcioId" name="consorcioId" required defaultValue={selectedConsorcioParam} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">
            <option value="" disabled>Seleccionar consorcio</option>
            {consorcios.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="fecha" className="text-sm font-medium text-slate-700">Fecha</label>
            <input id="fecha" name="fecha" type="date" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>
          <div className="space-y-1">
            <label htmlFor="periodo" className="text-sm font-medium text-slate-700">Periodo</label>
            <input id="periodo" name="periodo" required placeholder="2026-03" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="concepto" className="text-sm font-medium text-slate-700">Concepto</label>
          <input id="concepto" name="concepto" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="descripcion" className="text-sm font-medium text-slate-700">Descripcion</label>
          <textarea id="descripcion" name="descripcion" rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="tipoExpensa" className="text-sm font-medium text-slate-700">Tipo expensa</label>
            <select id="tipoExpensa" name="tipoExpensa" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">
              <option value="" disabled>Seleccionar tipo</option>
              {TIPOS_EXPENSA.map((tipo) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="rubroExpensa" className="text-sm font-medium text-slate-700">Rubro</label>
            <select id="rubroExpensa" name="rubroExpensa" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">
              <option value="" disabled>Seleccionar rubro</option>
              {RUBROS.map((rubro) => (
                <option key={rubro} value={rubro}>{rubro}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="proveedorId" className="text-sm font-medium text-slate-700">Proveedor (opcional)</label>
          <select id="proveedorId" name="proveedorId" defaultValue="" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="monto" className="text-sm font-medium text-slate-700">Monto</label>
          <input id="monto" name="monto" type="number" step="0.01" min="0.01" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="comprobante" className="text-sm font-medium text-slate-700">Comprobante (opcional)</label>
          <input id="comprobante" name="comprobante" type="file" disabled className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500" />
          <p className="text-xs text-slate-500">Campo preparado para implementacion futura de upload.</p>
        </div>

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Guardar</button>
      </form>
    </main>
  );
}






