import Link from "next/link";
import { redirect } from "next/navigation";

import { requireConsorcioRole } from "../../lib/auth";
import { getActiveConsorcioContext } from "../../lib/consorcio-activo";
import { redirectToOnboardingIfNoConsorcios } from "../../lib/onboarding";
import { prisma } from "../../lib/prisma";
import {
  TesoreriaError,
  ajustarCajaConsorcio,
  ajustarCuentaBancariaConsorcio,
  cambiarEstadoCuentaBancaria,
} from "../../lib/tesoreria";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

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

function getFeedbackMessage(code: string | undefined) {
  switch (code) {
    case "ajuste_caja_ok":
      return { type: "ok" as const, text: "El ajuste de caja se registro correctamente." };
    case "ajuste_cuenta_ok":
      return { type: "ok" as const, text: "El ajuste de cuenta bancaria se registro correctamente." };
    case "cuenta_actualizada_ok":
      return { type: "ok" as const, text: "El estado de la cuenta bancaria se actualizo correctamente." };
    case "monto_invalido":
      return { type: "error" as const, text: "El monto debe ser mayor a 0." };
    case "descripcion_requerida":
      return { type: "error" as const, text: "La observacion del ajuste es obligatoria." };
    case "tipo_ajuste_invalido":
      return { type: "error" as const, text: "El tipo de ajuste no es valido." };
    case "saldo_insuficiente":
      return { type: "error" as const, text: "La operacion no puede dejar saldo negativo." };
    case "cuenta_inexistente":
      return { type: "error" as const, text: "No se encontro la cuenta bancaria indicada." };
    case "cuenta_requerida":
      return { type: "error" as const, text: "Debes seleccionar una cuenta bancaria." };
    case "cuenta_expensas_no_desactivable":
      return { type: "error" as const, text: "La cuenta marcada para expensas no puede desactivarse desde Tesoreria." };
    case "consorcio_inexistente":
      return { type: "error" as const, text: "No se encontro el consorcio asociado a la operacion." };
    default:
      return null;
  }
}

export default async function TesoreriaPage({
  searchParams,
}: {
  searchParams?: {
    ok?: string;
    error?: string;
    cuentaId?: string;
  };
}) {
  const { access, consorcios, activeConsorcioId } = await getActiveConsorcioContext();
  redirectToOnboardingIfNoConsorcios(access);

  if (!activeConsorcioId) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Tesoreria</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No hay un consorcio activo valido para mostrar.
        </p>
      </main>
    );
  }

  const canOperate =
    access.isSuperAdmin ||
    access.assignments.some(
      (assignment) =>
        assignment.consorcioId === activeConsorcioId &&
        (assignment.role === "ADMIN" || assignment.role === "OPERADOR"),
    );

  const activeConsorcio = consorcios.find((consorcio) => consorcio.id === activeConsorcioId) ?? null;
  const selectedCuentaIdRaw = (searchParams?.cuentaId ?? "").trim();
  const selectedCuentaId = /^\d+$/.test(selectedCuentaIdRaw) ? Number(selectedCuentaIdRaw) : null;

  async function registrarAjusteCaja(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const tipo = (formData.get("tipo")?.toString() ?? "").trim();
    const monto = Number((formData.get("monto")?.toString() ?? "").trim());
    const descripcion = (formData.get("descripcion")?.toString() ?? "").trim();

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    try {
      await ajustarCajaConsorcio({
        consorcioId,
        tipo,
        monto,
        descripcion,
      });
    } catch (error) {
      if (error instanceof TesoreriaError) {
        redirect(`/tesoreria${buildReturnQuery({ error: error.code })}`);
      }
      throw error;
    }

    redirect(`/tesoreria${buildReturnQuery({ ok: "ajuste_caja_ok" })}`);
  }

  async function registrarAjusteCuenta(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const cuentaBancariaId = Number((formData.get("cuentaBancariaId")?.toString() ?? "").trim());
    const tipo = (formData.get("tipo")?.toString() ?? "").trim();
    const monto = Number((formData.get("monto")?.toString() ?? "").trim());
    const descripcion = (formData.get("descripcion")?.toString() ?? "").trim();

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    if (!Number.isInteger(cuentaBancariaId) || cuentaBancariaId <= 0) {
      redirect(`/tesoreria${buildReturnQuery({ error: "cuenta_requerida" })}`);
    }

    try {
      await ajustarCuentaBancariaConsorcio({
        consorcioId,
        cuentaBancariaId,
        tipo,
        monto,
        descripcion,
      });
    } catch (error) {
      if (error instanceof TesoreriaError) {
        redirect(`/tesoreria${buildReturnQuery({ error: error.code, cuentaId: String(cuentaBancariaId) })}`);
      }
      throw error;
    }

    redirect(`/tesoreria${buildReturnQuery({ ok: "ajuste_cuenta_ok", cuentaId: String(cuentaBancariaId) })}`);
  }

  async function toggleCuenta(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const cuentaBancariaId = Number(formData.get("cuentaId"));
    const activa = formData.get("activa") === "true";

    await requireConsorcioRole(consorcioId, ["ADMIN", "OPERADOR"]);

    try {
      await cambiarEstadoCuentaBancaria({
        consorcioId,
        cuentaBancariaId,
        activa,
      });
    } catch (error) {
      if (error instanceof TesoreriaError) {
        redirect(`/tesoreria${buildReturnQuery({ error: error.code, cuentaId: String(cuentaBancariaId) })}`);
      }
      throw error;
    }

    redirect(`/tesoreria${buildReturnQuery({ ok: "cuenta_actualizada_ok", cuentaId: String(cuentaBancariaId) })}`);
  }

  const [consorcio, movimientosRecientes, movimientosCaja] = await Promise.all([
    prisma.consorcio.findUnique({
      where: { id: activeConsorcioId },
      include: {
        cuentasBancarias: {
          orderBy: [{ esCuentaExpensas: "desc" }, { activa: "desc" }, { banco: "asc" }, { id: "asc" }],
        },
      },
    }),
    prisma.movimientoFondo.findMany({
      where: { consorcioId: activeConsorcioId },
      include: {
        consorcioCuentaBancaria: {
          select: {
            id: true,
            banco: true,
            alias: true,
            cbu: true,
          },
        },
      },
      orderBy: [{ fechaMovimiento: "desc" }, { id: "desc" }],
      take: 12,
    }),
    prisma.movimientoFondo.findMany({
      where: {
        consorcioId: activeConsorcioId,
        tipoDestino: "CAJA",
      },
      orderBy: [{ fechaMovimiento: "desc" }, { id: "desc" }],
      take: 5,
    }),
  ]);

  if (!consorcio) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Tesoreria</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          No se encontro el consorcio activo seleccionado.
        </p>
      </main>
    );
  }

  const cuentasActivas = consorcio.cuentasBancarias.filter((cuenta) => cuenta.activa);
  const saldoTotalBancos = consorcio.cuentasBancarias.reduce((acc, cuenta) => acc + cuenta.saldoActual, 0);
  const saldoTotalDisponible = consorcio.saldoCajaActual + saldoTotalBancos;
  const selectedCuenta =
    selectedCuentaId !== null
      ? consorcio.cuentasBancarias.find((cuenta) => cuenta.id === selectedCuentaId) ?? null
      : cuentasActivas[0] ?? consorcio.cuentasBancarias[0] ?? null;
  const feedback = getFeedbackMessage(searchParams?.error ?? searchParams?.ok);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tesoreria</h1>
          <p className="mt-1 text-sm text-slate-600">
            Operacion de caja, cuentas bancarias y movimientos del consorcio activo
            {activeConsorcio ? ` - ${activeConsorcio.nombre}` : ""}.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/consorcios/${consorcio.id}/editar`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Nueva cuenta bancaria
          </Link>
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Saldo actual de caja</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{formatCurrency(consorcio.saldoCajaActual)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Cuentas bancarias activas</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{cuentasActivas.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Saldo total en bancos</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{formatCurrency(saldoTotalBancos)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Saldo total disponible</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{formatCurrency(saldoTotalDisponible)}</p>
        </article>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Caja</h2>
                <p className="mt-1 text-sm text-slate-500">Saldo disponible y ultimos movimientos manuales o automaticos.</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-500">Saldo actual</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{formatCurrency(consorcio.saldoCajaActual)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ultimos movimientos de caja</h3>
                {movimientosCaja.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                    Todavia no hay movimientos de caja registrados.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {movimientosCaja.map((movimiento) => (
                      <div key={movimiento.id} className="rounded-lg border border-slate-200 px-4 py-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-slate-900">{movimiento.naturaleza}</span>
                          <span className={movimiento.naturaleza === "DISMINUCION" ? "text-red-700" : "text-emerald-700"}>
                            {movimiento.naturaleza === "DISMINUCION" ? "-" : "+"}
                            {formatCurrency(movimiento.monto)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{movimiento.descripcion ?? "-"}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(movimiento.fechaMovimiento)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ajustar caja</h3>
                {canOperate ? (
                  <form action={registrarAjusteCaja} className="mt-3 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <input type="hidden" name="consorcioId" value={consorcio.id} />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label htmlFor="caja-tipo" className="text-sm font-medium text-slate-700">Tipo de ajuste</label>
                        <select id="caja-tipo" name="tipo" defaultValue="INCREMENTO" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                          <option value="INCREMENTO">INCREMENTO</option>
                          <option value="DISMINUCION">DISMINUCION</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="caja-monto" className="text-sm font-medium text-slate-700">Monto</label>
                        <input id="caja-monto" name="monto" type="number" step="0.01" min="0.01" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="caja-descripcion" className="text-sm font-medium text-slate-700">Motivo / observacion</label>
                      <textarea id="caja-descripcion" name="descripcion" rows={3} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                    </div>

                    <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                      Ajustar caja
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                    Tenes acceso de lectura. Los ajustes manuales estan disponibles para administradores u operadores.
                  </p>
                )}
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Cuentas bancarias</h2>
                <p className="mt-1 text-sm text-slate-500">Saldos actuales y acciones operativas del consorcio activo.</p>
              </div>
              <Link
                href={`/consorcios/${consorcio.id}/editar`}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Editar cuentas
              </Link>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Banco</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Titular</th>
                    <th className="px-3 py-2 font-medium">Alias / CBU</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Saldo actual</th>
                    <th className="px-3 py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consorcio.cuentasBancarias.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-slate-500">
                        No hay cuentas bancarias cargadas para este consorcio.
                      </td>
                    </tr>
                  ) : (
                    consorcio.cuentasBancarias.map((cuenta) => (
                      <tr key={cuenta.id} className="align-top">
                        <td className="px-3 py-3 font-medium text-slate-900">{cuenta.banco}</td>
                        <td className="px-3 py-3 text-slate-700">{cuenta.tipoCuenta ?? "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{cuenta.titular}</td>
                        <td className="px-3 py-3 text-slate-700">
                          <div>{cuenta.alias ?? "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">{cuenta.cbu}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                              cuenta.activa ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {cuenta.activa ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-900">{formatCurrency(cuenta.saldoActual)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/consorcios/${consorcio.id}/editar`}
                              className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Editar
                            </Link>
                            <Link
                              href={`/tesoreria${buildReturnQuery({ cuentaId: String(cuenta.id) })}#ajuste-cuenta`}
                              className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Ajustar
                            </Link>
                            {canOperate ? (
                              <form action={toggleCuenta}>
                                <input type="hidden" name="consorcioId" value={consorcio.id} />
                                <input type="hidden" name="cuentaId" value={cuenta.id} />
                                <input type="hidden" name="activa" value={cuenta.activa ? "false" : "true"} />
                                <button
                                  type="submit"
                                  className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  {cuenta.activa ? "Desactivar" : "Activar"}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        <div className="space-y-6">
          <article id="ajuste-cuenta" className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Ajuste manual de cuenta bancaria</h2>
            <p className="mt-1 text-sm text-slate-500">Registra ajustes manuales con trazabilidad y sin permitir saldos negativos.</p>

            {canOperate ? (
              <form action={registrarAjusteCuenta} className="mt-4 space-y-4">
                <input type="hidden" name="consorcioId" value={consorcio.id} />

                <div className="space-y-1">
                  <label htmlFor="cuentaBancariaId" className="text-sm font-medium text-slate-700">Cuenta bancaria</label>
                  <select
                    id="cuentaBancariaId"
                    name="cuentaBancariaId"
                    defaultValue={selectedCuenta?.id?.toString() ?? ""}
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {consorcio.cuentasBancarias.map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.id}>
                        {cuenta.banco} - {cuenta.alias ?? cuenta.cbu}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="cuenta-tipo" className="text-sm font-medium text-slate-700">Tipo de ajuste</label>
                    <select id="cuenta-tipo" name="tipo" defaultValue="INCREMENTO" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                      <option value="INCREMENTO">INCREMENTO</option>
                      <option value="DISMINUCION">DISMINUCION</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="cuenta-monto" className="text-sm font-medium text-slate-700">Monto</label>
                    <input id="cuenta-monto" name="monto" type="number" step="0.01" min="0.01" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="cuenta-descripcion" className="text-sm font-medium text-slate-700">Motivo / observacion</label>
                  <textarea id="cuenta-descripcion" name="descripcion" rows={3} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Ajustar cuenta bancaria
                </button>
              </form>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                Tenes acceso de lectura. Los ajustes manuales estan disponibles para administradores u operadores.
              </p>
            )}
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Movimientos recientes</h2>
            <p className="mt-1 text-sm text-slate-500">Ultimos ingresos y ajustes registrados en Tesoreria.</p>

            <div className="mt-4 space-y-3">
              {movimientosRecientes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                  Todavia no hay movimientos de fondos registrados.
                </p>
              ) : (
                movimientosRecientes.map((movimiento) => (
                  <div key={movimiento.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {movimiento.tipoOrigen} · {movimiento.tipoDestino}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {movimiento.descripcion ?? "-"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${movimiento.naturaleza === "DISMINUCION" ? "text-red-700" : "text-emerald-700"}`}>
                          {movimiento.naturaleza === "DISMINUCION" ? "-" : "+"}
                          {formatCurrency(movimiento.monto)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(movimiento.fechaMovimiento)}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Saldo anterior: {formatCurrency(movimiento.saldoAnterior)}</span>
                      <span>Saldo posterior: {formatCurrency(movimiento.saldoPosterior)}</span>
                      <span>
                        Destino:{" "}
                        {movimiento.tipoDestino === "CAJA"
                          ? "Caja"
                          : movimiento.consorcioCuentaBancaria
                            ? `${movimiento.consorcioCuentaBancaria.banco} - ${movimiento.consorcioCuentaBancaria.alias ?? movimiento.consorcioCuentaBancaria.cbu}`
                            : "Cuenta bancaria"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
