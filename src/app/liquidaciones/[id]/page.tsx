import Link from "next/link";
import { redirect } from "next/navigation";
import ConfirmSubmitButton from "../_components/ConfirmSubmitButton";
import LiquidacionArchivosPanel from "../_components/LiquidacionArchivosPanel";

import { prisma } from "../../../lib/prisma";
import { getAccessContext, requireConsorcioAccess, requireConsorcioRole } from "../../../lib/auth";
import { getPeriodoVariants } from "../../../lib/periodo";
import { enviarLiquidacionCerradaEmails, formatEmailSummary } from "../../../lib/liquidacion-email";

export default async function LiquidacionDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    error?: string;
    ok?: string;
    enviados?: string;
    fallidos?: string;
    sinDestinatario?: string;
  };
}) {
  const id = Number(params.id);

  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id },
    include: {
      consorcio: { select: { id: true, nombre: true } },
      archivos: {
        where: { activo: true },
        orderBy: [{ tipoArchivo: "asc" }, { createdAt: "asc" }],
      },
      expensas: {
        include: {
          unidad: {
            select: { identificador: true, tipo: true, porcentajeExpensas: true },
          },
          pagos: {
            select: { id: true },
          },
        },
        orderBy: { unidadId: "asc" },
      },
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
  const canAdmin = access.isSuperAdmin || assignmentRole === "ADMIN";

  const hasExpensas = liquidacion.expensas.length > 0;
  const canRegenerateExistingExpensas =
    liquidacion.estado === "BORRADOR" &&
    hasExpensas &&
    liquidacion.expensas.every((e) => e.estado === "PENDIENTE" && e.pagos.length === 0);

  async function generarExpensas(formData: FormData) {
    "use server";

    const liquidacionId = Number(formData.get("id"));
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      select: { id: true, consorcioId: true, periodo: true, estado: true },
    });

    if (!liquidacion) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(liquidacion.consorcioId, ["ADMIN", "OPERADOR"]);

    if (liquidacion.estado !== "BORRADOR") {
      redirect(`/liquidaciones/${liquidacion.id}?error=estado_invalido_generar`);
    }

    const existingExpensas = await prisma.expensa.findMany({
      where: { liquidacionId: liquidacion.id },
      select: {
        id: true,
        estado: true,
        pagos: {
          select: { id: true },
        },
      },
    });

    const hasPagos = existingExpensas.some((e) => e.pagos.length > 0);
    if (hasPagos) {
      redirect(`/liquidaciones/${liquidacion.id}?error=regeneracion_con_pagos`);
    }

    if (existingExpensas.length > 0 && !existingExpensas.every((e) => e.estado === "PENDIENTE")) {
      redirect(`/liquidaciones/${liquidacion.id}?error=regeneracion_bloqueada`);
    }

    const unidades = await prisma.unidad.findMany({
      where: { consorcioId: liquidacion.consorcioId },
      orderBy: [{ piso: "asc" }, { departamento: "asc" }, { id: "asc" }],
      select: { id: true, porcentajeExpensas: true },
    });

    if (unidades.length === 0) {
      redirect(`/liquidaciones/${liquidacion.id}?error=sin_unidades`);
    }

    const faltanPorcentaje = unidades.some((u) => u.porcentajeExpensas === null);
    if (faltanPorcentaje) {
      redirect(`/liquidaciones/${liquidacion.id}?error=porcentaje_faltante`);
    }

    const periodoVariants = getPeriodoVariants(liquidacion.periodo);
    const totalGastos = await prisma.gasto.aggregate({
      where: { consorcioId: liquidacion.consorcioId, periodo: { in: periodoVariants } },
      _sum: { monto: true },
    });

    const total = totalGastos._sum.monto ?? 0;

    const expensasData = unidades.map((u) => {
      const porcentaje = u.porcentajeExpensas ?? 0;
      const monto = (total * porcentaje) / 100;

      return {
        liquidacionId: liquidacion.id,
        unidadId: u.id,
        monto,
        saldo: monto,
        estado: "PENDIENTE",
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.liquidacion.update({
        where: { id: liquidacion.id },
        data: { total },
      });

      if (existingExpensas.length > 0) {
        await tx.expensa.deleteMany({ where: { liquidacionId: liquidacion.id } });
      }

      await tx.expensa.createMany({ data: expensasData });
    });

    redirect(`/liquidaciones/${liquidacion.id}`);
  }

  async function emitirLiquidacion(formData: FormData) {
    "use server";

    const liquidacionId = Number(formData.get("id"));
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      select: { id: true, consorcioId: true, periodo: true, estado: true },
    });

    if (!liquidacion) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(liquidacion.consorcioId, ["ADMIN"]);

    if (liquidacion.estado !== "BORRADOR") {
      redirect(`/liquidaciones/${liquidacion.id}?error=estado_invalido_emitir`);
    }

    const expensasCount = await prisma.expensa.count({ where: { liquidacionId: liquidacion.id } });
    if (expensasCount === 0) {
      redirect(`/liquidaciones/${liquidacion.id}?error=sin_expensas`);
    }

    await prisma.liquidacion.update({
      where: { id: liquidacion.id },
      data: { estado: "EMITIDA" },
    });

    redirect(`/liquidaciones/${liquidacion.id}`);
  }

  async function cerrarLiquidacion(formData: FormData) {
    "use server";

    const liquidacionId = Number(formData.get("id"));
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      select: { id: true, consorcioId: true, periodo: true, estado: true },
    });

    if (!liquidacion) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(liquidacion.consorcioId, ["ADMIN"]);

    if (liquidacion.estado !== "EMITIDA") {
      redirect(`/liquidaciones/${liquidacion.id}?error=estado_invalido_cerrar`);
    }

    const periodoVariants = getPeriodoVariants(liquidacion.periodo);
    const gastosPeriodo = await prisma.gasto.findMany({
      where: {
        consorcioId: liquidacion.consorcioId,
        periodo: { in: periodoVariants },
      },
      include: {
        proveedor: { select: { nombre: true } },
      },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });

    await prisma.$transaction(async (tx) => {
      await tx.liquidacionGastoHistorico.deleteMany({
        where: { liquidacionId: liquidacion.id },
      });

      if (gastosPeriodo.length > 0) {
        await tx.liquidacionGastoHistorico.createMany({
          data: gastosPeriodo.map((g) => ({
            liquidacionId: liquidacion.id,
            gastoOrigenId: g.id,
            fecha: g.fecha,
            periodo: g.periodo,
            concepto: g.concepto,
            descripcion: g.descripcion,
            tipoExpensa: g.tipoExpensa,
            rubroExpensa: g.rubroExpensa,
            monto: g.monto,
            proveedorNombre: g.proveedor?.nombre ?? null,
          })),
        });
      }

      await tx.liquidacion.update({
        where: { id: liquidacion.id },
        data: { estado: "CERRADA" },
      });
    });

    const summary = await enviarLiquidacionCerradaEmails(liquidacion.id);
    const params = new URLSearchParams({
      ok: "emails_liquidacion",
      enviados: String(summary.enviados),
      fallidos: String(summary.fallidos),
      sinDestinatario: String(summary.sinDestinatario),
    });

    redirect(`/liquidaciones/${liquidacion.id}?${params.toString()}`);
  }

  async function eliminarBorrador(formData: FormData) {
    "use server";

    const liquidacionId = Number(formData.get("id"));
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      select: { id: true, consorcioId: true, periodo: true, estado: true },
    });

    if (!liquidacion) {
      redirect("/liquidaciones");
    }

    await requireConsorcioRole(liquidacion.consorcioId, ["ADMIN", "OPERADOR"]);

    if (liquidacion.estado !== "BORRADOR") {
      redirect(`/liquidaciones/${liquidacion.id}?error=estado_invalido_eliminar`);
    }

    const cobranzasCount = await prisma.pago.count({
      where: {
        expensa: {
          liquidacionId: liquidacion.id,
        },
      },
    });

    if (cobranzasCount > 0) {
      redirect(`/liquidaciones/${liquidacion.id}?error=eliminar_con_cobranzas`);
    }

    await prisma.liquidacion.delete({
      where: { id: liquidacion.id },
    });

    redirect("/liquidaciones");
  }
  const gastos = await prisma.gasto.findMany({
    where: {
      consorcioId: liquidacion.consorcioId,
      periodo: { in: getPeriodoVariants(liquidacion.periodo) },
    },
    include: {
      proveedor: {
        select: { nombre: true },
      },
    },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
  });

  const summaryMessage =
    searchParams?.ok === "emails_liquidacion"
      ? formatEmailSummary({
          total:
            Number(searchParams?.enviados ?? 0) +
            Number(searchParams?.fallidos ?? 0) +
            Number(searchParams?.sinDestinatario ?? 0),
          enviados: Number(searchParams?.enviados ?? 0),
          fallidos: Number(searchParams?.fallidos ?? 0),
          sinDestinatario: Number(searchParams?.sinDestinatario ?? 0),
        })
      : null;

  const errorMessage =
    searchParams?.error === "regeneracion_con_pagos"
      ? "No se puede regenerar: ya hay cobranzas registradas sobre expensas de esta liquidacion."
      : searchParams?.error === "regeneracion_bloqueada"
        ? "No se puede regenerar: hay expensas con estado distinto de PENDIENTE."
      : searchParams?.error === "sin_unidades"
        ? "No hay unidades para generar expensas."
      : searchParams?.error === "porcentaje_faltante"
        ? "No se puede generar: hay unidades sin porcentaje de expensas."
      : searchParams?.error === "sin_expensas"
        ? "No se puede emitir una liquidacion sin expensas generadas."
      : searchParams?.error === "estado_invalido_generar"
        ? "Solo se pueden generar o regenerar expensas en estado BORRADOR."
      : searchParams?.error === "estado_invalido_emitir"
        ? "Solo se puede emitir una liquidacion en estado BORRADOR."
      : searchParams?.error === "estado_invalido_cerrar"
        ? "Solo se puede cerrar una liquidacion en estado EMITIDA."
      : searchParams?.error === "estado_invalido_eliminar"
        ? "Solo se puede eliminar una liquidacion en estado BORRADOR."
      : searchParams?.error === "eliminar_con_cobranzas"
        ? "No se puede eliminar: la liquidacion tiene cobranzas registradas en sus expensas."
      : null;
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Link href="/liquidaciones" className="text-blue-600 hover:underline">
            Volver
          </Link>
          <h1 className="text-2xl font-semibold">Liquidacion {liquidacion.periodo}</h1>
        </div>

        <div className="flex items-center gap-2">
          {liquidacion.estado === "BORRADOR" ? (
            <Link href={`/liquidaciones/${liquidacion.id}/editar`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Editar
            </Link>
          ) : null}

          {liquidacion.estado === "BORRADOR" && canOperate ? (
            <form action={eliminarBorrador}>
              <input type="hidden" name="id" value={liquidacion.id} />
              <ConfirmSubmitButton
                label="Eliminar borrador"
                confirmMessage="Esta accion eliminara la liquidacion borrador y sus expensas generadas. Queres continuar?"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              />
            </form>
          ) : null}

          {liquidacion.estado === "BORRADOR" && canOperate && (!hasExpensas || canRegenerateExistingExpensas) ? (
            <form action={generarExpensas}>
              <input type="hidden" name="id" value={liquidacion.id} />
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {hasExpensas ? "Regenerar expensas" : "Generar expensas"}
              </button>
            </form>
          ) : null}

          {liquidacion.estado === "BORRADOR" && canAdmin ? (
            <form action={emitirLiquidacion}>
              <input type="hidden" name="id" value={liquidacion.id} />
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Emitir
              </button>
            </form>
          ) : null}

          {liquidacion.estado === "EMITIDA" && canAdmin ? (
            <form action={cerrarLiquidacion}>
              <input type="hidden" name="id" value={liquidacion.id} />
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Cerrar
              </button>
            </form>
          ) : null}
        </div>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {summaryMessage ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{summaryMessage}</div>
      ) : null}

      {liquidacion.estado === "BORRADOR" && hasExpensas && !canRegenerateExistingExpensas ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Esta liquidacion ya tiene expensas no regenerables (con cobranzas o estados avanzados).
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <p>
          <span className="font-medium">Consorcio:</span> {liquidacion.consorcio.nombre}
        </p>
        <p>
          <span className="font-medium">Periodo:</span> {liquidacion.periodo}
        </p>
        <p>
          <span className="font-medium">Fecha emision:</span> {liquidacion.fechaEmision.toLocaleDateString()}
        </p>
        <p>
          <span className="font-medium">Total:</span> {(liquidacion.total ?? 0).toFixed(2)}
        </p>
        <p>
          <span className="font-medium">Estado:</span> {liquidacion.estado}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Gastos incluidos</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-sm text-slate-600">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Concepto</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800">
              {gastos.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={5} className="px-4 py-4 text-slate-500">
                    Sin gastos para este periodo.
                  </td>
                </tr>
              ) : (
                gastos.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <td className="px-4 py-4">{g.fecha.toLocaleDateString()}</td>
                    <td className="px-4 py-4">{g.concepto}</td>
                    <td className="px-4 py-4">{g.rubroExpensa}</td>
                    <td className="px-4 py-4">{g.proveedor?.nombre ?? "-"}</td>
                    <td className="px-4 py-4">{g.monto.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Expensas generadas</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-sm text-slate-600">
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 font-medium">Porcentaje</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800">
              {liquidacion.expensas.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={5} className="px-4 py-4 text-slate-500">
                    Aun no se generaron expensas.
                  </td>
                </tr>
              ) : (
                liquidacion.expensas.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-4 py-4">
                      <Link href={`/expensas/${e.id}`} className="text-blue-600 hover:underline">
                        {e.unidad.identificador} ({e.unidad.tipo})
                      </Link>
                    </td>
                    <td className="px-4 py-4">{e.unidad.porcentajeExpensas ?? "-"}</td>
                    <td className="px-4 py-4">{e.monto.toFixed(2)}</td>
                    <td className="px-4 py-4">{e.saldo.toFixed(2)}</td>
                    <td className="px-4 py-4">{e.estado}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <LiquidacionArchivosPanel
        liquidacionId={liquidacion.id}
        archivos={liquidacion.archivos}
        canRegenerate={canOperate && (liquidacion.estado === "FINALIZADA" || liquidacion.estado === "CERRADA")}
      />
    </main>
  );
}












