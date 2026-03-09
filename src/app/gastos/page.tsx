import Link from "next/link";
import { redirect } from "next/navigation";

import ConfirmSubmitButton from "../liquidaciones/_components/ConfirmSubmitButton";
import { getActiveConsorcioContext } from "../../lib/consorcio-activo";
import { requireConsorcioRole } from "../../lib/auth";
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

export default async function GastosPage({
  searchParams,
}: {
  searchParams?: { consorcioId?: string; periodo?: string; proveedorId?: string; tipoExpensa?: string; rubro?: string; error?: string };
}) {
  const { access, activeConsorcioId } = await getActiveConsorcioContext();
  const canManage =
    access.isSuperAdmin || access.assignments.some((assignment) => assignment.role === "ADMIN" || assignment.role === "OPERADOR");

  if (!access.isSuperAdmin && access.allowedConsorcioIds.length === 0) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Gastos</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          Tu cuenta aun no tiene acceso asignado. Contacta al administrador.
        </p>
      </main>
    );
  }

  async function eliminarGasto(formData: FormData) {
    "use server";

    const gastoId = Number(formData.get("id"));
    const gasto = await prisma.gasto.findUnique({
      where: { id: gastoId },
      select: {
        id: true,
        consorcioId: true,
        liquidacion: {
          select: { estado: true },
        },
      },
    });

    if (!gasto) {
      redirect("/gastos?error=gasto_inexistente");
    }

    await requireConsorcioRole(gasto.consorcioId, ["ADMIN", "OPERADOR"]);

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

  const rawConsorcioId = consorcioIdParam ? Number(consorcioIdParam) : null;
  const consorcioId = Number.isNaN(rawConsorcioId) ? null : rawConsorcioId;
  const rawProveedorId = proveedorIdParam ? Number(proveedorIdParam) : null;
  const proveedorId = Number.isNaN(rawProveedorId) ? null : rawProveedorId;

  const effectiveConsorcioId =
    consorcioId && (access.isSuperAdmin || access.allowedConsorcioIds.includes(consorcioId)) ? consorcioId : null;

  const [consorcios, proveedores, gastos] = await Promise.all([
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
      },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
    }),
  ]);
  const rolesByConsorcio = new Map(access.assignments.map((a) => [a.consorcioId, a.role]));

  const errorMessage =
    searchParams?.error === "gasto_bloqueado_liquidacion"
      ? "No se puede eliminar: el gasto pertenece a una liquidacion emitida o cerrada."
      : searchParams?.error === "gasto_inexistente"
        ? "El gasto indicado no existe."
        : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Gastos</h1>
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

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5"
      >
        <select
          name="consorcioId"
          defaultValue={effectiveConsorcioId?.toString() ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los consorcios</option>
          {consorcios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
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
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
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

        <div className="flex gap-2">
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
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Filtrar
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Periodo</th>
              <th className="px-4 py-3 font-medium">Consorcio</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 font-medium">Tipo expensa</th>
              <th className="px-4 py-3 font-medium">Rubro</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-800">
            {gastos.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td className="px-4 py-4 text-slate-500" colSpan={9}>
                  Sin gastos cargados.
                </td>
              </tr>
            ) : (
              gastos.map((gasto) => (
                <tr key={gasto.id} className="border-t border-slate-100">
                  <td className="px-4 py-4">{formatDateAR(gasto.fecha)}</td>
                  <td className="px-4 py-4">{gasto.periodo}</td>
                  <td className="px-4 py-4">{gasto.consorcio.nombre}</td>
                  <td className="px-4 py-4">
                    <Link href={`/gastos/${gasto.id}`} className="text-blue-600 hover:underline">
                      {gasto.concepto}
                    </Link>
                  </td>
                  <td className="px-4 py-4">{gasto.tipoExpensa}</td>
                  <td className="px-4 py-4">{gasto.rubroExpensa}</td>
                  <td className="px-4 py-4">{gasto.proveedor?.nombre ?? "-"}</td>
                  <td className="px-4 py-4">{gasto.monto.toFixed(2)}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      {access.isSuperAdmin ||
                      rolesByConsorcio.get(gasto.consorcioId) === "ADMIN" ||
                      rolesByConsorcio.get(gasto.consorcioId) === "OPERADOR" ? (
                        <>
                          <Link href={`/gastos/${gasto.id}/editar`} className="text-blue-600 hover:underline">
                            Editar
                          </Link>
                          <form action={eliminarGasto}>
                            <input type="hidden" name="id" value={gasto.id} />
                            <ConfirmSubmitButton
                              label="Eliminar"
                              confirmMessage="Esta accion eliminara el gasto. Queres continuar?"
                              className="text-red-600 hover:underline"
                            />
                          </form>
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
    </main>
  );
}
