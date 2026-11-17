// Simulación del cierre de un ejercicio. Solo lectura: no modifica saldos,
// expensas, liquidaciones ni movimientos. Ver docs/cierre-anual.md.
//
// Criterios:
// - Caja y bancos (lo percibido): por fecha efectiva (Pago.fechaPago,
//   PagoGasto.fechaPago, MovimientoFondo.fechaMovimiento) dentro del ejercicio.
// - Lo devengado (gastos y liquidaciones): por período "AAAA-MM" cuyo primer
//   día cae dentro del ejercicio. Así la liquidación de septiembre, emitida en
//   octubre, pertenece al ejercicio que cierra el 30/09.
// - Créditos al cierre: capital de expensas de liquidaciones con período ≤
//   cierre, menos capital cobrado hasta el cierre, sin contar la deuda ya
//   trasladada a otra liquidación del mismo corte. No incluye intereses no
//   liquidados.

import { formatFechaCalendario, rangoConsultaEjercicio } from "./ejercicios";
import { tieneComprobante } from "./gasto-comprobante";
import { prisma } from "./prisma";

const EPSILON = 0.005;

export function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** "AAAA-MM" del período, o null si no tiene ese formato. */
function normalizarPeriodo(periodo: string): string | null {
  const m = periodo.trim().match(/^(\d{4})-?(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function mesDeFecha(fecha: Date) {
  return formatFechaCalendario(fecha).slice(0, 7);
}

export type Inconsistencia = {
  codigo: string;
  gravedad: "ALTA" | "MEDIA" | "INFO";
  titulo: string;
  detalle: string;
  items: Array<{ texto: string; href?: string; monto?: number }>;
};

export type EjercicioSimulable = {
  id: number;
  numero: number;
  fechaInicio: Date;
  fechaFin: Date;
  aperturaEstado: string;
};

export type SimulacionCierre = Awaited<ReturnType<typeof simularCierrePeriodo>>;

export async function simularCierreEjercicio(ejercicioId: number, consorcioId: number) {
  const ejercicio = await prisma.ejercicio.findFirst({ where: { id: ejercicioId, consorcioId } });
  if (!ejercicio) return null;
  return simularCierrePeriodo(ejercicio, consorcioId);
}

/** Núcleo de la simulación; recibe el ejercicio ya validado contra el consorcio. */
export async function simularCierrePeriodo(ejercicio: EjercicioSimulable, consorcioId: number) {
  const rango = rangoConsultaEjercicio(ejercicio);
  const periodoDesde = mesDeFecha(ejercicio.fechaInicio);
  const periodoHasta = mesDeFecha(ejercicio.fechaFin);
  const enEjercicio = (periodo: string | null) => !!periodo && periodo >= periodoDesde && periodo <= periodoHasta;

  const [
    consorcio,
    cuentas,
    movimientos,
    cobros,
    pagosGastos,
    gastos,
    liquidaciones,
    expensas,
    deudasTrasladadas,
    ejercicioAnterior,
  ] = await Promise.all([
    prisma.consorcio.findUnique({ where: { id: consorcioId }, select: { id: true, nombre: true } }),
    prisma.consorcioCuentaBancaria.findMany({
      where: { consorcioId },
      select: { id: true, banco: true, alias: true, numeroCuenta: true, activa: true, saldoActual: true },
      orderBy: { id: "asc" },
    }),
    prisma.movimientoFondo.findMany({
      where: { consorcioId },
      orderBy: [{ fechaMovimiento: "asc" }, { id: "asc" }],
      select: {
        id: true,
        fechaMovimiento: true,
        tipoOrigen: true,
        tipoDestino: true,
        naturaleza: true,
        descripcion: true,
        monto: true,
        saldoAnterior: true,
        saldoPosterior: true,
        consorcioCuentaBancariaId: true,
      },
    }),
    prisma.pago.findMany({
      where: { expensa: { unidad: { consorcioId } }, fechaPago: { lt: rango.lt } },
      select: {
        id: true,
        expensaId: true,
        fechaPago: true,
        monto: true,
        montoCapital: true,
        montoInteres: true,
        medioPago: true,
        movimientoFondo: { select: { id: true } },
        expensa: { select: { unidad: { select: { identificador: true } }, liquidacion: { select: { periodo: true } } } },
      },
    }),
    prisma.pagoGasto.findMany({
      where: { consorcioId, fechaPago: { lt: rango.lt } },
      select: {
        id: true,
        gastoId: true,
        fechaPago: true,
        monto: true,
        movimientoFondo: { select: { id: true } },
        gasto: { select: { concepto: true, rubroExpensa: true, tipoExpensa: true } },
      },
    }),
    prisma.gasto.findMany({
      where: { consorcioId },
      select: {
        id: true,
        fecha: true,
        periodo: true,
        concepto: true,
        tipoExpensa: true,
        rubroExpensa: true,
        monto: true,
        comprobantePath: true,
        comprobanteNombreOriginal: true,
        comprobanteFaltanteMotivo: true,
        proveedor: { select: { nombre: true } },
      },
    }),
    prisma.liquidacion.findMany({
      where: { consorcioId },
      select: {
        id: true,
        periodo: true,
        estado: true,
        fechaEmision: true,
        montoOrdinarias: true,
        montoExtraordinarias: true,
        montoFondoReserva: true,
        total: true,
      },
      orderBy: { periodo: "asc" },
    }),
    prisma.expensa.findMany({
      where: { unidad: { consorcioId } },
      select: {
        id: true,
        monto: true,
        saldo: true,
        estado: true,
        unidadId: true,
        unidad: { select: { identificador: true } },
        liquidacion: { select: { id: true, periodo: true, estado: true } },
      },
    }),
    prisma.liquidacionDeuda.findMany({
      where: { liquidacion: { consorcioId, estado: { in: ["FINALIZADA", "CERRADA"] } } },
      select: {
        expensaId: true,
        criterio: true,
        capitalOriginal: true,
        interesCalculado: true,
        importeLiquidado: true,
        liquidacion: { select: { id: true, periodo: true } },
        expensa: {
          select: { estado: true, saldo: true, unidad: { select: { identificador: true } }, liquidacion: { select: { periodo: true } } },
        },
      },
    }),
    prisma.ejercicio.findFirst({
      where: { consorcioId, fechaFin: { lt: ejercicio.fechaInicio }, id: { not: ejercicio.id } },
      select: { id: true },
    }),
  ]);

  const inconsistencias: Inconsistencia[] = [];

  const cobrosPeriodo = cobros.filter((p) => p.fechaPago >= rango.gte);
  const pagosGastosPeriodo = pagosGastos.filter((p) => p.fechaPago >= rango.gte);
  const ajustesDelPeriodo = movimientos.filter(
    (m) => m.tipoOrigen === "AJUSTE_MANUAL" && m.fechaMovimiento >= rango.gte && m.fechaMovimiento < rango.lt,
  );

  // Cobros registrados sin movimiento de fondos (p. ej. cargas iniciales previas
  // a Tesorería) cuyo ingreso se registró con un ajuste manual del mismo total:
  // ese ajuste se trata como cobranza y no como ajuste.
  const cobrosSinMovimiento = cobrosPeriodo.filter((p) => !p.movimientoFondo);
  const totalSinMovimiento = redondear(cobrosSinMovimiento.reduce((a, p) => a + p.monto, 0));
  const ajusteCompensatorio =
    cobrosSinMovimiento.length > 0
      ? ajustesDelPeriodo.find(
          (m) => m.naturaleza === "INCREMENTO" && Math.abs(m.monto - totalSinMovimiento) <= EPSILON,
        ) ?? null
      : null;
  const esCobranza = (m: { id: number; tipoOrigen: string }) =>
    m.tipoOrigen === "PAGO_EXPENSA" || m.id === ajusteCompensatorio?.id;
  const ajustesPeriodo = ajustesDelPeriodo.filter((m) => m.id !== ajusteCompensatorio?.id);

  // ---------------------------------------------------------------- Fondos
  const aperturaConocida = ejercicio.aperturaEstado === "CERO_CONFIRMADO";
  const cuentasFondos = [
    { clave: "CAJA", nombre: "Caja", cuentaId: null as number | null, activa: true },
    ...cuentas.map((c) => ({
      clave: `CUENTA_${c.id}`,
      nombre: [c.banco, c.alias ?? c.numeroCuenta].filter(Boolean).join(" - "),
      cuentaId: c.id as number | null,
      activa: c.activa,
    })),
  ];

  const fondos = cuentasFondos.map((cuenta) => {
    const propios = movimientos.filter((m) =>
      cuenta.cuentaId === null ? m.tipoDestino === "CAJA" : m.consorcioCuentaBancariaId === cuenta.cuentaId,
    );
    const delPeriodo = propios.filter((m) => m.fechaMovimiento >= rango.gte && m.fechaMovimiento < rango.lt);
    const previos = propios.filter((m) => m.fechaMovimiento < rango.gte);
    const signo = (m: (typeof propios)[number]) => (m.naturaleza === "DISMINUCION" ? -1 : 1);
    const sumar = (filtro: (m: (typeof propios)[number]) => boolean) =>
      redondear(delPeriodo.filter(filtro).reduce((acc, m) => acc + signo(m) * m.monto, 0));

    const cobranzas = sumar((m) => esCobranza(m));
    const pagos = sumar((m) => m.tipoOrigen === "PAGO_GASTO");
    const ajustes = sumar((m) => !esCobranza(m) && m.tipoOrigen !== "PAGO_GASTO");
    const inicial = aperturaConocida ? 0 : null;
    const finalCalculado = inicial === null ? null : redondear(inicial + cobranzas + pagos + ajustes);
    // saldoPosterior refleja el orden de carga, no el cronológico: tomar el último cargado.
    const ultimo =
      propios.filter((m) => m.fechaMovimiento < rango.lt).reduce<(typeof propios)[number] | null>(
        (acc, m) => (!acc || m.id > acc.id ? m : acc),
        null,
      ) ?? null;

    return {
      ...cuenta,
      inicial,
      cobranzas,
      pagos,
      ajustes,
      finalCalculado,
      saldoSegunRegistros: ultimo ? redondear(ultimo.saldoPosterior) : 0,
      movimientosPeriodo: delPeriodo.length,
      movimientosPrevios: previos.length,
    };
  });

  // ------------------------------------------------- Ingresos y egresos

  const meses: string[] = [];
  for (let d = ejercicio.fechaInicio; d < rango.lt; ) {
    meses.push(mesDeFecha(d));
    const siguiente = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    d = siguiente;
  }

  const porMes = meses.map((mes) => {
    const cobrosMes = cobrosPeriodo.filter((p) => mesDeFecha(p.fechaPago) === mes);
    const capital = redondear(cobrosMes.reduce((a, p) => a + (p.montoCapital ?? p.monto), 0));
    const interes = redondear(cobrosMes.reduce((a, p) => a + (p.montoInteres ?? 0), 0));
    const egresos = redondear(
      pagosGastosPeriodo.filter((p) => mesDeFecha(p.fechaPago) === mes).reduce((a, p) => a + p.monto, 0),
    );
    const ajustes = redondear(
      ajustesPeriodo
        .filter((m) => mesDeFecha(m.fechaMovimiento) === mes)
        .reduce((a, m) => a + (m.naturaleza === "DISMINUCION" ? -m.monto : m.monto), 0),
    );
    return { mes, cobranzasCapital: capital, cobranzasInteres: interes, egresos, ajustes };
  });

  const totales = {
    cobranzasCapital: redondear(porMes.reduce((a, m) => a + m.cobranzasCapital, 0)),
    cobranzasInteres: redondear(porMes.reduce((a, m) => a + m.cobranzasInteres, 0)),
    egresos: redondear(porMes.reduce((a, m) => a + m.egresos, 0)),
    ajustes: redondear(porMes.reduce((a, m) => a + m.ajustes, 0)),
  };

  // ------------------------------------------------------ Gastos (devengado)
  const pagadoPorGasto = new Map<number, number>();
  for (const p of pagosGastos) pagadoPorGasto.set(p.gastoId, (pagadoPorGasto.get(p.gastoId) ?? 0) + p.monto);

  const gastosEjercicio = gastos.filter((g) => enEjercicio(normalizarPeriodo(g.periodo)));
  const rubros = new Map<string, { tipoExpensa: string; rubro: string; devengado: number; pagado: number; cantidad: number }>();
  for (const g of gastosEjercicio) {
    const clave = `${g.tipoExpensa}|${g.rubroExpensa}`;
    const r = rubros.get(clave) ?? { tipoExpensa: g.tipoExpensa, rubro: g.rubroExpensa, devengado: 0, pagado: 0, cantidad: 0 };
    r.devengado += g.monto;
    r.pagado += Math.min(g.monto, pagadoPorGasto.get(g.id) ?? 0);
    r.cantidad += 1;
    rubros.set(clave, r);
  }
  const gastosPorRubro = Array.from(rubros.values())
    .map((r) => ({ ...r, devengado: redondear(r.devengado), pagado: redondear(r.pagado), pendiente: redondear(r.devengado - r.pagado) }))
    .sort((a, b) => a.tipoExpensa.localeCompare(b.tipoExpensa) || b.devengado - a.devengado);

  // Deudas con proveedores al cierre: gastos con período ≤ cierre no pagados al cierre.
  const deudasProveedores = gastos
    .filter((g) => {
      const p = normalizarPeriodo(g.periodo);
      return !!p && p <= periodoHasta;
    })
    .map((g) => ({
      id: g.id,
      periodo: g.periodo,
      concepto: g.concepto,
      proveedor: g.proveedor?.nombre ?? null,
      pendiente: redondear(g.monto - (pagadoPorGasto.get(g.id) ?? 0)),
    }))
    .filter((g) => g.pendiente > EPSILON);

  // ------------------------------------------------------- Liquidaciones
  // Importe de deudas de meses anteriores que cada liquidación volvió a incluir
  // (mismo criterio que el paso 3 del wizard).
  const trasladoIncluidoPorLiquidacion = new Map<number, number>();
  for (const d of deudasTrasladadas) {
    const importe =
      d.criterio === "TOTAL"
        ? d.capitalOriginal + d.interesCalculado
        : d.criterio === "CAPITAL"
          ? d.capitalOriginal
          : d.criterio === "INTERES"
            ? d.interesCalculado
            : d.importeLiquidado;
    trasladoIncluidoPorLiquidacion.set(d.liquidacion.id, (trasladoIncluidoPorLiquidacion.get(d.liquidacion.id) ?? 0) + importe);
  }

  const liquidacionesEjercicio = liquidaciones
    .filter((l) => enEjercicio(normalizarPeriodo(l.periodo)))
    .map((l) => ({
      ...l,
      deudaTrasladada: redondear(trasladoIncluidoPorLiquidacion.get(l.id) ?? 0),
      cargosNuevos: redondear((l.total ?? 0) - (trasladoIncluidoPorLiquidacion.get(l.id) ?? 0)),
      ordinarias: redondear(l.montoOrdinarias ?? 0),
      extraordinarias: redondear(l.montoExtraordinarias ?? 0),
      fondoReserva: redondear(l.montoFondoReserva ?? 0),
      emitido: redondear(l.total ?? 0),
    }));

  const fondoReservaLiquidado = redondear(liquidacionesEjercicio.reduce((a, l) => a + l.fondoReserva, 0));

  // ---------------------------------------------- Créditos por unidad al cierre
  const capitalCobradoPorExpensa = new Map<number, number>();
  for (const p of cobros) {
    capitalCobradoPorExpensa.set(p.expensaId, (capitalCobradoPorExpensa.get(p.expensaId) ?? 0) + (p.montoCapital ?? p.monto));
  }

  const trasladadoPorExpensa = new Map<number, number>();
  for (const d of deudasTrasladadas) {
    const p = normalizarPeriodo(d.liquidacion.periodo);
    if (!p || p > periodoHasta) continue;
    const capital =
      d.criterio === "TOTAL" || d.criterio === "CAPITAL"
        ? d.capitalOriginal
        : d.criterio === "PARCIAL"
          ? Math.min(d.importeLiquidado, d.capitalOriginal)
          : 0;
    trasladadoPorExpensa.set(d.expensaId, (trasladadoPorExpensa.get(d.expensaId) ?? 0) + capital);
  }

  const creditosPorUnidad = new Map<number, { unidad: string; capital: number; expensas: number }>();
  for (const e of expensas) {
    const p = normalizarPeriodo(e.liquidacion.periodo);
    if (!p || p > periodoHasta) continue;
    const pendiente =
      e.monto - (capitalCobradoPorExpensa.get(e.id) ?? 0) - (trasladadoPorExpensa.get(e.id) ?? 0);
    if (pendiente <= EPSILON) continue;
    const c = creditosPorUnidad.get(e.unidadId) ?? { unidad: e.unidad.identificador, capital: 0, expensas: 0 };
    c.capital += pendiente;
    c.expensas += 1;
    creditosPorUnidad.set(e.unidadId, c);
  }
  const creditos = Array.from(creditosPorUnidad.values())
    .map((c) => ({ ...c, capital: redondear(c.capital) }))
    .sort((a, b) => a.unidad.localeCompare(b.unidad, "es", { numeric: true }));

  // ---------------------------------------------------------- Inconsistencias
  if (ejercicio.aperturaEstado !== "CERO_CONFIRMADO") {
    inconsistencias.push({
      codigo: "APERTURA",
      gravedad: "ALTA",
      titulo: "Saldos de apertura sin detalle",
      detalle:
        ejercicio.aperturaEstado === "PENDIENTE"
          ? "La apertura está pendiente: no se puede calcular el saldo final de caja y bancos."
          : "La apertura figura como informada, pero todavía no hay detalle por cuenta: el saldo final no se calcula.",
      items: [],
    });
  }

  if (cobrosSinMovimiento.length > 0) {
    const compensacion = ajusteCompensatorio;
    inconsistencias.push({
      codigo: "COBROS_SIN_MOVIMIENTO",
      gravedad: compensacion ? "INFO" : "ALTA",
      titulo: compensacion ? "Cobranzas ingresadas por ajuste manual" : "Cobranzas sin movimiento de fondos",
      detalle: compensacion
        ? `Suman ${totalSinMovimiento} y coinciden con el ajuste manual del ${formatFechaCalendario(
            compensacion.fechaMovimiento,
          )} («${compensacion.descripcion ?? "sin descripción"}»), que registró su ingreso. En caja y bancos ese ajuste se cuenta como cobranza.`
        : `Suman ${totalSinMovimiento}. Están registrados en la expensa pero no impactaron en caja ni bancos. Verificar si se compensaron con un ajuste manual.`,
      items: cobrosSinMovimiento.map((p) => ({
        texto: `${formatFechaCalendario(p.fechaPago)} · ${p.expensa.unidad.identificador} · expensa ${p.expensa.liquidacion.periodo}`,
        href: `/expensas/${p.expensaId}`,
        monto: redondear(p.monto),
      })),
    });
  }

  const pagosSinMovimiento = pagosGastosPeriodo.filter((p) => !p.movimientoFondo);
  if (pagosSinMovimiento.length > 0) {
    inconsistencias.push({
      codigo: "PAGOS_SIN_MOVIMIENTO",
      gravedad: "ALTA",
      titulo: "Pagos de gastos sin movimiento de fondos",
      detalle: "Estos pagos no impactaron en caja ni bancos.",
      items: pagosSinMovimiento.map((p) => ({
        texto: `${formatFechaCalendario(p.fechaPago)} · ${p.gasto.concepto}`,
        href: `/gastos/${p.gastoId}`,
        monto: redondear(p.monto),
      })),
    });
  }

  // Ajustes del mismo día entre caja y banco que se compensan: transferencias internas.
  const ajustesPorDia = new Map<string, typeof ajustesPeriodo>();
  for (const m of ajustesPeriodo) {
    const dia = formatFechaCalendario(m.fechaMovimiento);
    ajustesPorDia.set(dia, [...(ajustesPorDia.get(dia) ?? []), m]);
  }
  const netoDia = (lista: typeof ajustesPeriodo) =>
    lista.reduce((a, m) => a + (m.naturaleza === "DISMINUCION" ? -m.monto : m.monto), 0);
  const esParCajaBanco = (lista: typeof ajustesPeriodo) =>
    lista.some((m) => m.naturaleza === "INCREMENTO") &&
    lista.some((m) => m.naturaleza === "DISMINUCION") &&
    new Set(lista.map((m) => m.tipoDestino)).size > 1;
  const diasTransferencia = Array.from(ajustesPorDia.entries()).filter(([, lista]) => esParCajaBanco(lista));
  const transferenciasOk = diasTransferencia.filter(([, lista]) => Math.abs(netoDia(lista)) <= EPSILON);
  const transferenciasDescuadradas = diasTransferencia.filter(([, lista]) => Math.abs(netoDia(lista)) > EPSILON);
  const idsTransferencia = new Set(transferenciasOk.flatMap(([, lista]) => lista.map((m) => m.id)));
  const ajustesSueltos = ajustesPeriodo.filter((m) => !idsTransferencia.has(m.id));

  const itemAjuste = (m: (typeof ajustesPeriodo)[number]) => ({
    texto: `${formatFechaCalendario(m.fechaMovimiento)} · ${m.tipoDestino === "CAJA" ? "Caja" : "Banco"} · ${
      m.naturaleza === "DISMINUCION" ? "Disminución" : "Incremento"
    } · ${m.descripcion ?? "sin descripción"}`,
    href: "/tesoreria",
    monto: redondear(m.naturaleza === "DISMINUCION" ? -m.monto : m.monto),
  });

  if (ajustesSueltos.length > 0) {
    inconsistencias.push({
      codigo: "AJUSTES_MANUALES",
      gravedad: "MEDIA",
      titulo: "Ajustes manuales de caja y bancos",
      detalle:
        "No son ingresos ni egresos y no tienen contrapartida el mismo día: pueden ser saldos iniciales o correcciones. Revisar el respaldo de cada uno.",
      items: ajustesSueltos.map(itemAjuste),
    });
  }

  if (transferenciasOk.length > 0) {
    inconsistencias.push({
      codigo: "TRANSFERENCIAS_INTERNAS",
      gravedad: "INFO",
      titulo: "Transferencias entre caja y banco",
      detalle: "Ajustes del mismo día que se compensan entre caja y banco: no afectan el total de fondos.",
      items: transferenciasOk.flatMap(([, lista]) => lista.map(itemAjuste)),
    });
  }

  if (transferenciasDescuadradas.length > 0) {
    inconsistencias.push({
      codigo: "TRANSFERENCIA_DESCUADRADA",
      gravedad: "MEDIA",
      titulo: "Transferencias entre caja y banco que no cierran",
      detalle: "El mismo día hay un ajuste de entrada y otro de salida entre caja y banco con importes distintos.",
      items: transferenciasDescuadradas.map(([dia, lista]) => ({
        texto: `${dia} · ${lista
          .map((m) => `${m.tipoDestino === "CAJA" ? "Caja" : "Banco"} ${m.naturaleza === "DISMINUCION" ? "-" : "+"}${m.monto}`)
          .join(" / ")}`,
        href: "/tesoreria",
        monto: redondear(netoDia(lista)),
      })),
    });
  }

  const dobleConteo = deudasTrasladadas.filter(
    (d) => (d.criterio === "TOTAL" || d.criterio === "CAPITAL") && d.expensa.estado !== "PAGADA" && d.expensa.saldo > EPSILON,
  );
  if (dobleConteo.length > 0) {
    inconsistencias.push({
      codigo: "DEUDA_TRASLADADA_PENDIENTE",
      gravedad: "ALTA",
      titulo: "Deuda trasladada que sigue pendiente en la expensa original",
      detalle:
        "La deuda se incluyó en una liquidación posterior, pero la expensa original sigue con saldo. En los créditos de esta simulación se cuenta una sola vez; en el resto del sistema puede figurar dos veces.",
      items: dobleConteo.map((d) => ({
        texto: `${d.expensa.unidad.identificador} · expensa ${d.expensa.liquidacion.periodo} trasladada a ${d.liquidacion.periodo} (${d.criterio})`,
        href: `/liquidaciones/${d.liquidacion.id}`,
        monto: redondear(d.expensa.saldo),
      })),
    });
  }

  const gastosSinArchivo = gastosEjercicio.filter((g) => !tieneComprobante(g));
  const gastosSinComprobante = gastosSinArchivo.filter((g) => !g.comprobanteFaltanteMotivo?.trim());
  const gastosJustificados = gastosSinArchivo.filter((g) => g.comprobanteFaltanteMotivo?.trim());
  if (gastosSinComprobante.length > 0) {
    inconsistencias.push({
      codigo: "GASTOS_SIN_COMPROBANTE",
      gravedad: "MEDIA",
      titulo: "Gastos sin comprobante adjunto",
      detalle:
        "La rendición debe ser documentada (art. 2067 inc. e CCyC). Adjuntá el comprobante o indicá el motivo desde la edición del gasto.",
      items: gastosSinComprobante.map((g) => ({
        texto: `${g.periodo} · ${g.concepto}${g.proveedor ? ` · ${g.proveedor.nombre}` : ""}`,
        href: `/gastos/${g.id}/editar`,
        monto: redondear(g.monto),
      })),
    });
  }
  if (gastosJustificados.length > 0) {
    inconsistencias.push({
      codigo: "GASTOS_SIN_COMPROBANTE_JUSTIFICADOS",
      gravedad: "INFO",
      titulo: "Gastos sin comprobante, con motivo registrado",
      detalle: "Se informan en la rendición con el motivo indicado.",
      items: gastosJustificados.map((g) => ({
        texto: `${g.periodo} · ${g.concepto}${g.proveedor ? ` · ${g.proveedor.nombre}` : ""} — ${g.comprobanteFaltanteMotivo}`,
        href: `/gastos/${g.id}`,
        monto: redondear(g.monto),
      })),
    });
  }

  const liquidacionesAbiertas = liquidacionesEjercicio.filter((l) => l.estado !== "FINALIZADA" && l.estado !== "CERRADA");
  if (liquidacionesAbiertas.length > 0) {
    inconsistencias.push({
      codigo: "LIQUIDACIONES_ABIERTAS",
      gravedad: "ALTA",
      titulo: "Liquidaciones del ejercicio sin finalizar",
      detalle: "Los importes emitidos del ejercicio no están completos.",
      items: liquidacionesAbiertas.map((l) => ({ texto: `${l.periodo} · ${l.estado}`, href: `/liquidaciones/${l.id}` })),
    });
  }

  const periodosConLiquidacion = new Set(liquidacionesEjercicio.map((l) => normalizarPeriodo(l.periodo)));
  const mesesSinLiquidacion = meses.filter((m) => !periodosConLiquidacion.has(m));
  if (mesesSinLiquidacion.length > 0) {
    inconsistencias.push({
      codigo: "MESES_SIN_LIQUIDACION",
      gravedad: "INFO",
      titulo: "Meses del ejercicio sin liquidación",
      detalle: "Puede ser correcto (por ejemplo, antes de empezar a usar el sistema), pero conviene dejarlo explicado en las notas.",
      items: mesesSinLiquidacion.map((m) => ({ texto: m })),
    });
  }

  const conActividadPrevia = fondos.filter((f) => f.movimientosPrevios > 0);
  const gastosPrevios = gastos.filter((g) => {
    const p = normalizarPeriodo(g.periodo);
    return !!p && p < periodoDesde;
  });
  if (!ejercicioAnterior && (conActividadPrevia.length > 0 || gastosPrevios.length > 0)) {
    inconsistencias.push({
      codigo: "ACTIVIDAD_PREVIA",
      gravedad: "ALTA",
      titulo: "Hay registros anteriores al inicio del ejercicio",
      detalle:
        "No hay un ejercicio anterior registrado, pero existen movimientos o gastos previos. Revisar la fecha de inicio o la apertura.",
      items: [
        ...conActividadPrevia.map((f) => ({ texto: `${f.nombre}: ${f.movimientosPrevios} movimientos previos` })),
        ...(gastosPrevios.length > 0 ? [{ texto: `${gastosPrevios.length} gastos con período anterior` }] : []),
      ],
    });
  }

  const cuentasInactivasConActividad = fondos.filter((f) => !f.activa && f.movimientosPeriodo > 0);
  if (cuentasInactivasConActividad.length > 0) {
    inconsistencias.push({
      codigo: "CUENTAS_INACTIVAS",
      gravedad: "INFO",
      titulo: "Cuentas hoy inactivas con actividad en el ejercicio",
      detalle: "Se incluyen igual en la conciliación de fondos.",
      items: cuentasInactivasConActividad.map((f) => ({ texto: f.nombre })),
    });
  }

  const diferenciasFondos = fondos.filter(
    (f) => f.finalCalculado !== null && Math.abs(f.finalCalculado - f.saldoSegunRegistros) > EPSILON,
  );
  if (diferenciasFondos.length > 0) {
    inconsistencias.push({
      codigo: "FONDOS_NO_CONCILIAN",
      gravedad: "ALTA",
      titulo: "El saldo calculado no coincide con los registros",
      detalle:
        "El saldo inicial más los movimientos del ejercicio no da el saldo que registra el último movimiento al cierre. Suele deberse a movimientos cargados fuera de orden cronológico o a actividad previa.",
      items: diferenciasFondos.map((f) => ({
        texto: `${f.nombre}: calculado ${f.finalCalculado} / registrado ${f.saldoSegunRegistros}`,
        monto: redondear((f.finalCalculado ?? 0) - f.saldoSegunRegistros),
      })),
    });
  }

  const orden = { ALTA: 0, MEDIA: 1, INFO: 2 } as const;
  inconsistencias.sort((a, b) => orden[a.gravedad] - orden[b.gravedad]);

  const fondosFinal = fondos.every((f) => f.finalCalculado !== null)
    ? redondear(fondos.reduce((a, f) => a + (f.finalCalculado ?? 0), 0))
    : null;

  return {
    generadoAt: new Date(),
    consorcio,
    ejercicio,
    periodoDesde,
    periodoHasta,
    fondos,
    fondosInicial: aperturaConocida ? 0 : null,
    fondosFinal,
    porMes,
    totales,
    gastosPorRubro,
    gastosDevengados: redondear(gastosPorRubro.reduce((a, r) => a + r.devengado, 0)),
    deudasProveedores,
    deudaProveedoresTotal: redondear(deudasProveedores.reduce((a, d) => a + d.pendiente, 0)),
    liquidaciones: liquidacionesEjercicio,
    emitidoTotal: redondear(liquidacionesEjercicio.reduce((a, l) => a + l.emitido, 0)),
    cargosNuevosTotal: redondear(liquidacionesEjercicio.reduce((a, l) => a + l.cargosNuevos, 0)),
    deudaTrasladadaTotal: redondear(liquidacionesEjercicio.reduce((a, l) => a + l.deudaTrasladada, 0)),
    fondoReservaLiquidado,
    creditos,
    creditosTotal: redondear(creditos.reduce((a, c) => a + c.capital, 0)),
    inconsistencias,
  };
}
