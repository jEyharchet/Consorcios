import Link from "next/link";
import { redirect } from "next/navigation";

import ConfirmSubmitButton from "../liquidaciones/_components/ConfirmSubmitButton";
import { getActiveConsorcioContext } from "../../lib/consorcio-activo";
import { requireConsorcioRole } from "../../lib/auth";
import { redirectToOnboardingIfNoConsorcios } from "../../lib/onboarding";
import { buildGastoPagoSummary, type GastoPagoEstado } from "../../lib/pagos-gastos";
import { prisma } from "../../lib/prisma";
import { getPeriodoVariants, normalizePeriodo } from "../../lib/periodo";
import { formatDateAR } from "../../lib/relaciones";

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

const ESTADOS_PAGO: GastoPagoEstado[] = ["PENDIENTE", "PAGADO_PARCIAL", "PAGADO_TOTAL"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function getEstadoBadgeClasses(estado: GastoPagoEstado) {
  switch (estado) {
    case "PAGADO_TOTAL":
      return "bg-emerald-100 text-emerald-800";
    case "PAGADO_PARCIAL":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams?: {
    consorcioId?: string;
    periodo?: string;
    proveedorId?: string;
    tipoExpensa?: string;
    rubro?: string;
    estadoPago?: string;
    error?: string;
  };
}) {
  const { access, activeConsorcioId, consorcios: accessibleConsorcios } = await getActiveConsorcioContext();
  const canManage =
    access.isSuperAdmin || access.assignments.some((assignment) => assignment.role === "ADMIN" || assignment.role === "OPERADOR");

  redirectToOnboardingIfNoConsorcios(access);

  async function eliminarGasto(formData: FormData) {
    "use server";

    const gastoId = Number(formData.get("id"));
    const gasto = await prisma.gasto.findUnique({
      where: { id: gastoId },
      select: {
        id: true,
        consorcioId: true,
        pagosGasto: {
          select: { id: true },
          take: 1,
        },
        liquidacion: {
          select: { estado: true },
        },
      },
    });

    if (!gasto) {
      redirect("/gastos?error=gasto_inexistente");
    }

    await requireConsorcioRole(gasto.consorcioId, ["ADMIN", "OPERADOR"]);

    if (gasto.pagosGasto.length > 0) {
      redirect("/gastos?error=gasto_con_pagos");
    }

    if (gasto.liquidacion && gasto.liquidacion.estado !== "BORRADOR") {
      redirect("/gastos?error=gasto_bloqueado_liquidacion");
    }

    await prisma.gasto.delete({ where: { id: gasto.id } });
    redirect("/gastos");
  }

  const rawConsorcioIdParam = (searchParams?.consorcioId ?? "").trim();
  const consorcioIdParam = rawConsorcioIdParam || (activeConsorcioId ? String(activeConsorcioId) : "");
  const periodoInput = (searchParams?.periodo ?? "").trim();
  const normalizedPeriodo = normalizePeriodo(periodoInput);
  const periodoParam = normalizedPeriodo ?? periodoInput;
  const proveedorIdParam = (searchParams?.proveedorId ?? "").trim();
  const tipoExpensaParam = (searchParams?.tipoExpensa ?? "").trim();
  const rubroParam = (searchParams?.rubro ?? "").trim();
  const estadoPagoParam = (searchParams?.estadoPago ?? "").trim() as GastoPagoEstado | "";

  const rawConsorcioId = consorcioIdParam ? Number(consorcioIdParam) : null;
  const consorcioId = Number.isNaN(rawConsorcioId) ? null : rawConsorcioId;
  const rawProveedorId = proveedorIdParam ? Number(proveedorIdParam) : null;
  const proveedorId = Number.isNaN(rawProveedorId) ? null : rawProveedorId;

  const effectiveConsorcioId =
    consorcioId && (access.isSuperAdmin || access.allowedConsorcioIds.includes(consorcioId)) ? consorcioId : null;

  const [consorcios, proveedores, gastosRaw] = await Promise.all([
    prisma.consorcio.findMany({
      where: access.isSuperAdmin ? undefined : { id: { in: access.allowedConsorcioIds } },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
    prisma.proveedor.findMany({
      where: {
        consorcios: {
          some: {
            ...(access.isSuperAdmin ? {} : { consorcioId: { in: access.allowedConsorcioIds } }),
            ...(effectiveConsorcioId ? { consorcioId: effectiveConsorcioId } : {}),
          },
        },
      },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
    prisma.gasto.findMany({
      where: {
        ...(access.isSuperAdmin ? {} : { consorcioId: { in: access.allowedConsorcioIds } }),
        ...(effectiveConsorcioId ? { consorcioId: effectiveConsorcioId } : {}),
        ...(normalizedPeriodo ? { periodo: { in: getPeriodoVariants(normalizedPeriodo) } } : {}),
        ...(proveedorId ? { proveedorId } : {}),
        ...(tipoExpensaParam ? { tipoExpensa: tipoExpensaParam } : {}),
        ...(rubroParam ? { rubroExpensa: rubroParam } : {}),
      },
      include: {
        consorcio: { select: { nombre: true } },
        proveedor: { select: { nombre: true } },
        liquidacion: { select: { estado: true } },
        pagosGasto: {
          orderBy: [{ fechaPago: "desc" }, { id: "desc" }],
          select: {
            id: true,
            monto: true,
            fechaPago: true,
          },
        },
      },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
    }),
  ]);

  const rolesByConsorcio = new Map(access.assignments.map((assignment) => [assignment.consorcioId, assignment.role]));
  const activeConsorcio = accessibleConsorcios.find((consorcio) => consorcio.id === effectiveConsorcioId) ?? null;

  const gastos = gastosRaw
    .map((gasto) => {
      const resumenPago = buildGastoPagoSummary({
        montoTotal: gasto.monto,
        pagos: gasto.pagosGasto,
      });

      return {
        ...gasto,
        totalPagado: resumenPago.totalPagado,
        saldoPendiente: resumenPago.saldoPendiente,
        estadoPago: resumenPago.estado,
      };
    })
    .filter((gasto) => !estadoPagoParam || gasto.estadoPago === estadoPagoParam);

  const kpis = {
    cantidad: gastos.length,
    total: gastos.reduce((acc, gasto) => acc + gasto.monto, 0),
    pagado: gastos.reduce((acc, gasto) => acc + gasto.totalPagado, 0),
    pendiente: gastos.reduce((acc, gasto) => acc + gasto.saldoPendiente, 0),
  };

  const errorMessage =
    searchParams?.error === "gasto_bloqueado_liquidacion"
      ? "No se puede eliminar: el gasto pertenece a una liquidacion emitida o cerrada."
      : searchParams?.error === "gasto_inexistente"
        ? "El gasto indicado no existe."
        : searchParams?.error === "gasto_con_pagos"
          ? "No se puede eliminar el gasto porque ya tiene pagos registrados."
          : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gastos</h1>
          <p className="mt-1 text-sm text-slate-600">
            Vista operativa de gastos, pagos y saldo pendiente
            {activeConsorcio ? ` - ${activeConsorcio.nombre}` : ""}.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/gastos/nuevo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Nuevo gasto
          </Link>
        ) : null}
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Cantidad de gastos</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{kpis.cantidad}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Monto total</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{formatCurrency(kpis.total)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total pagado</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{formatCurrency(kpis.pagado)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total pendiente</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{formatCurrency(kpis.pendiente)}</p>
        </article>
      </section>

      <form
        method="GET"
        className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6"
      >
        <select
          name="consorcioId"
          defaultValue={effectiveConsorcioId?.toString() ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los consorcios</option>
          {consorcios.map((consorcio) => (
            <option key={consorcio.id} value={consorcio.id}>
              {consorcio.nombre}
            </option>
          ))}
        </select>

        <input
          name="periodo"
          defaultValue={periodoParam}
          placeholder="Periodo (ej: 2026-03)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <select
          name="proveedorId"
          defaultValue={proveedorId?.toString() ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((proveedor) => (
            <option key={proveedor.id} value={proveedor.id}>
              {proveedor.nombre}
            </option>
          ))}
        </select>

        <select
          name="tipoExpensa"
          defaultValue={tipoExpensaParam}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los tipos</option>
          {TIPOS_EXPENSA.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>

        <select
          name="rubro"
          defaultValue={rubroParam}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los rubros</option>
          {RUBROS.map((rubro) => (
            <option key={rubro} value={rubro}>
              {rubro}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <select
            name="estadoPago"
            defaultValue={estadoPagoParam}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Todos los estados</option>
            {ESTADOS_PAGO.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Filtrar
          </button>
        </div>
      </form>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Periodo</th>
                <th className="px-4 py-3 font-medium">Concepto</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Tipo expensa</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 font-medium">Monto total</th>
                <th className="px-4 py-3 font-medium">Pagado</th>
                <th className="px-4 py-3 font-medium">Saldo pendiente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {gastos.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={11}>
                    No hay gastos para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                gastos.map((gasto) => (
                  <tr key={gasto.id} className="align-top">
                    <td className="px-4 py-4">{formatDateAR(gasto.fecha)}</td>
                    <td className="px-4 py-4">{gasto.periodo}</td>
                    <td className="px-4 py-4">
                      <Link href={`/gastos/${gasto.id}`} className="font-medium text-blue-600 hover:underline">
                        {gasto.concepto}
                      </Link>
                    </td>
                    <td className="px-4 py-4">{gasto.proveedor?.nombre ?? "-"}</td>
                    <td className="px-4 py-4">{gasto.tipoExpensa}</td>
                    <td className="px-4 py-4">{gasto.rubroExpensa}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(gasto.monto)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(gasto.totalPagado)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(gasto.saldoPendiente)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getEstadoBadgeClasses(gasto.estadoPago)}`}>
                        {gasto.estadoPago}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-3">
                        <Link href={`/gastos/${gasto.id}`} className="text-blue-600 hover:underline">
                          Ver pagos
                        </Link>
                        {canManage ? (
                          <>
                            <Link href={`/gastos/${gasto.id}/editar`} className="text-blue-600 hover:underline">
                              Editar
                            </Link>
                            {gasto.saldoPendiente > 0 ? (
                              <Link href={`/gastos/${gasto.id}/pago`} className="text-blue-600 hover:underline">
                                Registrar pago
                              </Link>
                            ) : null}
                            {(access.isSuperAdmin ||
                              rolesByConsorcio.get(gasto.consorcioId) === "ADMIN" ||
                              rolesByConsorcio.get(gasto.consorcioId) === "OPERADOR") ? (
                              <form action={eliminarGasto}>
                                <input type="hidden" name="id" value={gasto.id} />
                                <ConfirmSubmitButton
                                  label="Eliminar"
                                  confirmMessage="Esta accion eliminara el gasto. Queres continuar?"
                                  className="text-red-600 hover:underline"
                                />
                              </form>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
