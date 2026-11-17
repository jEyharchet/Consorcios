import Link from "next/link";
import { redirect } from "next/navigation";

import { requireConsorcioRole } from "../../../../lib/auth";
import {
  MAX_COMPROBANTE_GASTO_LABEL,
  MENSAJES_COMPROBANTE_GASTO,
  leerComprobanteGasto,
  tieneComprobante,
} from "../../../../lib/gasto-comprobante";
import { getPeriodoVariants, normalizePeriodo } from "../../../../lib/periodo";
import { EJERCICIO_CERRADO_MENSAJE, ejercicioCerradoPorPeriodo } from "../../../../lib/ejercicio-bloqueo";
import { prisma } from "../../../../lib/prisma";
import { normalizeDate } from "../../../../lib/relaciones";

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

export default async function EditarGastoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; ok?: string };
}) {
  const id = Number(params.id);

  const gasto = await prisma.gasto.findUnique({
    where: { id },
    include: {
      consorcio: { select: { nombre: true } },
      liquidacion: { select: { estado: true } },
      pagosGasto: {
        select: { monto: true },
      },
    },
  });

  if (!gasto) {
    return <div className="p-6">Gasto no encontrado</div>;
  }

  await requireConsorcioRole(gasto.consorcioId, ["ADMIN", "OPERADOR"]);

  // Adjuntar o reemplazar el comprobante (o explicar por qué no hay) no cambia
  // importes: se permite aunque el gasto esté pagado o su liquidación cerrada.
  async function actualizarComprobante(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    const gastoActual = await prisma.gasto.findUnique({ where: { id }, select: { consorcioId: true, periodo: true } });

    if (!gastoActual) {
      redirect("/gastos");
    }

    await requireConsorcioRole(gastoActual.consorcioId, ["ADMIN", "OPERADOR"]);

    // El comprobante forma parte de la rendición confirmada: con el ejercicio cerrado no se cambia.
    if (await ejercicioCerradoPorPeriodo(gastoActual.consorcioId, gastoActual.periodo)) {
      redirect(`/gastos/${id}/editar?error=ejercicio_cerrado`);
    }

    const lectura = await leerComprobanteGasto(formData.get("comprobante"));
    if (!lectura.ok) {
      redirect(`/gastos/${id}/editar?error=${lectura.error}`);
    }

    const motivo = (formData.get("comprobanteFaltanteMotivo")?.toString() ?? "").trim() || null;

    await prisma.gasto.update({
      where: { id },
      data: lectura.comprobante
        ? { ...lectura.comprobante, comprobanteFaltanteMotivo: null }
        : { comprobanteFaltanteMotivo: motivo },
    });

    redirect(`/gastos/${id}/editar?ok=comprobante_guardado`);
  }

  const conComprobante = tieneComprobante(gasto);
  const comprobanteError = searchParams?.error ? MENSAJES_COMPROBANTE_GASTO[searchParams.error] ?? null : null;
  const seccionComprobante = (
    <form
      action={actualizarComprobante}
      encType="multipart/form-data"
      className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6"
    >
      <input type="hidden" name="id" value={gasto.id} />
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Comprobante</h2>
        <p className="mt-1 text-sm text-slate-500">
          {conComprobante
            ? `Adjunto: ${gasto.comprobanteNombreOriginal ?? "comprobante"}. Podés reemplazarlo por otro archivo.`
            : "Este gasto no tiene comprobante. Podés adjuntarlo aunque el gasto ya esté pagado o liquidado."}
        </p>
      </div>

      {searchParams?.ok === "comprobante_guardado" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          El comprobante se guardó correctamente.
        </div>
      ) : null}
      {comprobanteError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{comprobanteError}</div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="comprobante" className="text-sm font-medium text-slate-700">
          {conComprobante ? "Reemplazar archivo" : "Archivo"}
        </label>
        <input
          id="comprobante"
          name="comprobante"
          type="file"
          accept="application/pdf,image/*"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
        />
        <p className="text-xs text-slate-500">PDF, JPG, PNG o WEBP. Máximo {MAX_COMPROBANTE_GASTO_LABEL}.</p>
      </div>

      {!conComprobante ? (
        <div className="space-y-1">
          <label htmlFor="comprobanteFaltanteMotivo" className="text-sm font-medium text-slate-700">
            Motivo por el que no hay comprobante
          </label>
          <textarea
            id="comprobanteFaltanteMotivo"
            name="comprobanteFaltanteMotivo"
            rows={2}
            defaultValue={gasto.comprobanteFaltanteMotivo ?? ""}
            placeholder="Ej.: por acuerdo con los propietarios no emite comprobante / proporción de medidor interno / compensación aprobada por el consejo"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
          <p className="text-xs text-slate-500">
            Queda como respaldo en la rendición. Si adjuntás un archivo, el motivo se borra.
          </p>
        </div>
      ) : null}

      <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        Guardar comprobante
      </button>
    </form>
  );

  const ejercicioCerrado = await ejercicioCerradoPorPeriodo(gasto.consorcioId, gasto.periodo);
  if (ejercicioCerrado) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="mb-6 space-y-2">
          <Link href={`/gastos/${gasto.id}`} className="text-blue-600 hover:underline">Volver</Link>
          <h1 className="text-2xl font-semibold">Editar gasto</h1>
        </header>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          El período {gasto.periodo} corresponde al ejercicio N.º {ejercicioCerrado.numero}, que está cerrado: el gasto y
          su comprobante no se pueden modificar. Para corregirlo, reabrí el ejercicio desde{" "}
          <Link href={`/administracion/ejercicios/${ejercicioCerrado.id}`} className="underline">
            Administración → Ejercicios
          </Link>
          .
        </div>
      </main>
    );
  }

  const liquidacionBloqueante = await prisma.liquidacion.findFirst({
    where: {
      consorcioId: gasto.consorcioId,
      periodo: { in: getPeriodoVariants(gasto.periodo) },
      estado: { in: ["EMITIDA", "CERRADA"] },
    },
    select: { id: true },
  });

  if (liquidacionBloqueante) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="mb-6 space-y-2">
          <Link href={`/gastos/${gasto.id}`} className="text-blue-600 hover:underline">Volver</Link>
          <h1 className="text-2xl font-semibold">Editar gasto</h1>
        </header>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este gasto no se puede editar porque la liquidacion del periodo esta emitida o cerrada.
        </div>

        {seccionComprobante}
      </main>
    );
  }

  const proveedores = await prisma.proveedor.findMany({
    where: {
      consorcios: {
        some: {
          consorcioId: gasto.consorcioId,
        },
      },
    },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  async function actualizarGasto(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    const gastoActual = await prisma.gasto.findUnique({ where: { id }, select: { consorcioId: true, periodo: true } });

    if (!gastoActual) {
      redirect("/gastos");
    }

    await requireConsorcioRole(gastoActual.consorcioId, ["ADMIN", "OPERADOR"]);

    const fechaRaw = (formData.get("fecha")?.toString() ?? "").trim();
    const periodoRaw = (formData.get("periodo")?.toString() ?? "").trim();
    const concepto = (formData.get("concepto")?.toString() ?? "").trim();
    const descripcionRaw = (formData.get("descripcion")?.toString() ?? "").trim();
    const tipoExpensa = (formData.get("tipoExpensa")?.toString() ?? "").trim();
    const rubroExpensa = (formData.get("rubroExpensa")?.toString() ?? "").trim();
    const proveedorIdRaw = (formData.get("proveedorId")?.toString() ?? "").trim();
    const montoRaw = (formData.get("monto")?.toString() ?? "").trim();

    if (!fechaRaw) redirect(`/gastos/${id}/editar?error=fecha_requerida`);
    if (!periodoRaw) redirect(`/gastos/${id}/editar?error=periodo_requerido`);
    if (!concepto) redirect(`/gastos/${id}/editar?error=concepto_requerido`);
    if (!tipoExpensa) redirect(`/gastos/${id}/editar?error=tipo_requerido`);
    if (!rubroExpensa) redirect(`/gastos/${id}/editar?error=rubro_requerido`);

    const periodo = normalizePeriodo(periodoRaw);
    if (!periodo) {
      redirect(`/gastos/${id}/editar?error=periodo_invalido`);
    }

    const fecha = new Date(fechaRaw);
    if (Number.isNaN(fecha.getTime())) {
      redirect(`/gastos/${id}/editar?error=fecha_requerida`);
    }

    const monto = Number(montoRaw);
    if (!montoRaw || Number.isNaN(monto) || monto <= 0) {
      redirect(`/gastos/${id}/editar?error=monto_invalido`);
    }

    const totalPagado = await prisma.pagoGasto.aggregate({
      where: { gastoId: id },
      _sum: { monto: true },
    });

    if (monto < (totalPagado._sum.monto ?? 0)) {
      redirect(`/gastos/${id}/editar?error=monto_menor_a_pagado`);
    }

    if (
      (await ejercicioCerradoPorPeriodo(gastoActual.consorcioId, gastoActual.periodo)) ||
      (await ejercicioCerradoPorPeriodo(gastoActual.consorcioId, periodo))
    ) {
      redirect(`/gastos/${id}/editar?error=ejercicio_cerrado`);
    }

    const liquidacionBloqueante = await prisma.liquidacion.findFirst({
      where: {
        consorcioId: gastoActual.consorcioId,
        periodo: { in: getPeriodoVariants(gastoActual.periodo) },
        estado: { in: ["EMITIDA", "CERRADA"] },
      },
      select: { id: true },
    });

    if (liquidacionBloqueante) {
      redirect(`/gastos/${id}/editar?error=liquidacion_bloqueada`);
    }

    const liquidacionDestinoBloqueante = await prisma.liquidacion.findFirst({
      where: {
        consorcioId: gastoActual.consorcioId,
        periodo: { in: getPeriodoVariants(periodo) },
        estado: { in: ["EMITIDA", "CERRADA"] },
      },
      select: { id: true },
    });

    if (liquidacionDestinoBloqueante) {
      redirect(`/gastos/${id}/editar?error=liquidacion_bloqueada`);
    }

    const proveedorId = proveedorIdRaw ? Number(proveedorIdRaw) : null;
    if (proveedorId) {
      const fechaNormalizada = normalizeDate(fecha);
      const proveedorHabilitado = await prisma.proveedorConsorcio.findFirst({
        where: {
          proveedorId,
          consorcioId: gastoActual.consorcioId,
          desde: { lte: fechaNormalizada },
          OR: [{ hasta: null }, { hasta: { gte: fechaNormalizada } }],
        },
        select: { id: true },
      });

      if (!proveedorHabilitado) {
        redirect(`/gastos/${id}/editar?error=proveedor_invalido`);
      }
    }

    await prisma.gasto.update({
      where: { id },
      data: {
        fecha,
        periodo,
        concepto,
        descripcion: descripcionRaw || null,
        tipoExpensa,
        rubroExpensa,
        proveedorId,
        monto,
      },
    });

    redirect(`/gastos/${id}`);
  }

  const errorMessage =
    searchParams?.error === "fecha_requerida"
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
                  : searchParams?.error === "liquidacion_bloqueada"
                    ? "El gasto no se puede editar porque la liquidacion del periodo esta emitida o cerrada."
                    : searchParams?.error === "monto_menor_a_pagado"
                      ? "El monto total del gasto no puede quedar por debajo de lo ya pagado."
                    : searchParams?.error === "ejercicio_cerrado"
                      ? EJERCICIO_CERRADO_MENSAJE
                    : null;


  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/gastos/${gasto.id}`} className="text-blue-600 hover:underline">Volver</Link>
        <h1 className="text-2xl font-semibold">Editar gasto</h1>
      </header>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <form action={actualizarGasto} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <input type="hidden" name="id" value={gasto.id} />

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Consorcio</label>
          <input value={gasto.consorcio.nombre} disabled className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor="fecha" className="text-sm font-medium text-slate-700">Fecha</label><input id="fecha" name="fecha" type="date" required defaultValue={gasto.fecha.toISOString().slice(0, 10)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" /></div>
          <div className="space-y-1"><label htmlFor="periodo" className="text-sm font-medium text-slate-700">Periodo</label><input id="periodo" name="periodo" required defaultValue={gasto.periodo} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" /></div>
        </div>

        <div className="space-y-1"><label htmlFor="concepto" className="text-sm font-medium text-slate-700">Concepto</label><input id="concepto" name="concepto" required defaultValue={gasto.concepto} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" /></div>
        <div className="space-y-1"><label htmlFor="descripcion" className="text-sm font-medium text-slate-700">Descripcion</label><textarea id="descripcion" name="descripcion" rows={3} defaultValue={gasto.descripcion ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" /></div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor="tipoExpensa" className="text-sm font-medium text-slate-700">Tipo expensa</label><select id="tipoExpensa" name="tipoExpensa" required defaultValue={gasto.tipoExpensa} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">{TIPOS_EXPENSA.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></div>
          <div className="space-y-1"><label htmlFor="rubroExpensa" className="text-sm font-medium text-slate-700">Rubro</label><select id="rubroExpensa" name="rubroExpensa" required defaultValue={gasto.rubroExpensa} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2">{RUBROS.map((rubro) => <option key={rubro} value={rubro}>{rubro}</option>)}</select></div>
        </div>

        <div className="space-y-1"><label htmlFor="proveedorId" className="text-sm font-medium text-slate-700">Proveedor (opcional)</label><select id="proveedorId" name="proveedorId" defaultValue={gasto.proveedorId ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"><option value="">Sin proveedor</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
        <div className="space-y-1"><label htmlFor="monto" className="text-sm font-medium text-slate-700">Monto</label><input id="monto" name="monto" type="number" step="0.01" min="0.01" required defaultValue={gasto.monto} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2" /></div>

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Guardar</button>
      </form>

      {seccionComprobante}
    </main>
  );
}


