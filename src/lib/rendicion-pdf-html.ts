import { textoOrigenApertura } from "./apertura";
import type { SimulacionCierre } from "./cierre-simulacion";
import { formatFechaCalendarioAR } from "./ejercicios";

// HTML de la rendición de cuentas de un ejercicio, a partir de la simulación
// del cierre. Se imprime con Chromium (ver /api/ejercicios/[id]/rendicion).

export type DatosRendicion = {
  simulacion: NonNullable<SimulacionCierre>;
  consorcio: {
    nombre: string;
    tituloLegal: string | null;
    direccion: string;
    ciudad: string | null;
    provincia: string | null;
    cuit: string | null;
  };
  administrador: {
    nombre: string;
    firmaDataUri: string | null;
    firmaAclaracion: string | null;
    firmaRol: string | null;
  } | null;
  vencimientoRendicion: Date;
  emitidaAt: Date;
  /** Notas libres del administrador (párrafos separados por una línea en blanco). */
  notasAdministrador: string | null;
  /** Versión confirmada del cierre; null mientras es un borrador. */
  version: { numero: number; confirmadoAt: Date; confirmadoPor: string | null; huella: string } | null;
  /** Comprobantes anexados al final del PDF, uno por archivo distinto. */
  anexo: AnexoIndice[];
};

export type AnexoIndice = {
  codigo: string;
  gastoIds: number[];
  nombre: string;
  /** null si el archivo no se pudo incorporar al PDF. */
  incorporado: boolean;
};

/** Párrafos de un texto libre: separados por líneas en blanco. */
export function parrafosNotas(texto: string | null | undefined) {
  return (texto ?? "")
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function esc(valor: string | null | undefined) {
  return (valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const moneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const $ = (v: number | null | undefined) => (v === null || v === undefined ? "—" : moneda.format(v));

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mes = (aaaamm: string) => {
  const [a, m] = aaaamm.split("-");
  return `${MESES[Number(m) - 1] ?? m} ${a}`;
};

function fechaHoraAR(fecha: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

function tabla(encabezados: Array<string | [string, "num"]>, filas: string[][], pie?: string[], clase = "") {
  const th = encabezados
    .map((h) => (Array.isArray(h) ? `<th class="num">${esc(h[0])}</th>` : `<th>${esc(h)}</th>`))
    .join("");
  const esNum = encabezados.map((h) => Array.isArray(h));
  const fila = (celdas: string[]) =>
    `<tr>${celdas.map((c, i) => `<td${esNum[i] ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`;
  return `<table${clase ? ` class="${clase}"` : ""}><thead><tr>${th}</tr></thead><tbody>${filas.map(fila).join("")}</tbody>${
    pie ? `<tfoot>${fila(pie)}</tfoot>` : ""
  }</table>`;
}

export function buildRendicionPdfHtml(datos: DatosRendicion) {
  const s = datos.simulacion;
  const { ejercicio } = s;
  const c = datos.consorcio;
  const periodo = `${formatFechaCalendarioAR(ejercicio.fechaInicio)} al ${formatFechaCalendarioAR(ejercicio.fechaFin)}`;
  const cobrado = s.totales.cobranzasCapital + s.totales.cobranzasInteres;
  const pendientes = s.inconsistencias.filter((i) => i.gravedad !== "INFO");
  const informativas = s.inconsistencias.filter((i) => i.gravedad === "INFO");
  const ubicacion = [c.direccion, c.ciudad, c.provincia].filter(Boolean).join(", ");
  const anexoPorGasto = new Map<number, AnexoIndice>();
  for (const a of datos.anexo) for (const id of a.gastoIds) anexoPorGasto.set(id, a);

  // 1. Resumen
  const resumen = tabla(
    ["Concepto", ["Importe", "num"]],
    [
      ["Caja y bancos al inicio del ejercicio", $(s.fondosInicial)],
      ["(+) Cobranzas de expensas", $(s.totales.cobranzasCapital)],
      ["(+) Intereses cobrados", $(s.totales.cobranzasInteres)],
      ["(−) Pagos de gastos", $(-s.totales.egresos)],
      ["(±) Ajustes y transferencias internas", $(s.totales.ajustes)],
    ],
    ["<strong>Caja y bancos al cierre</strong>", `<strong>${$(s.fondosFinal)}</strong>`],
  );
  const situacion = tabla(
    ["Situación al cierre", ["Importe", "num"]],
    [
      ["Caja y bancos", $(s.fondosFinal)],
      ["(+) Expensas pendientes de cobro", $(s.creditosTotal)],
      ["(−) Gastos pendientes de pago", $(-s.deudaProveedoresTotal)],
    ],
    [
      "<strong>Saldo neto del consorcio</strong>",
      `<strong>${s.fondosFinal === null ? "—" : $(s.fondosFinal + s.creditosTotal - s.deudaProveedoresTotal)}</strong>`,
    ],
  );

  // Composición del saldo
  const comp = s.composicion;
  const composicion = comp
    ? `<div class="dos"><div>${tabla(
        ["Qué forma el saldo neto", ["Importe", "num"]],
        [
          ...(comp.inicial ? [["Saldo neto al inicio del ejercicio", $(comp.inicial)]] : []),
          ["Fondo de reserva liquidado en el ejercicio", $(comp.fondoReserva)],
          ["(+) Intereses por mora cobrados", $(comp.interesesCobrados)],
          ...(comp.interesesEnTraslados ? [["(+) Intereses incluidos en deudas trasladadas", $(comp.interesesEnTraslados)]] : []),
          ["(+) Redondeos de las liquidaciones", $(comp.redondeos)],
          ...(Math.abs(comp.otrasDiferencias) >= 0.01 ? [["(±) Otras diferencias", $(comp.otrasDiferencias)]] : []),
        ],
        ["<strong>Saldo neto del consorcio</strong>", `<strong>${$(comp.saldoNeto)}</strong>`],
      )}</div><div>${tabla(
        ["Del saldo neto a caja y bancos", ["Importe", "num"]],
        [
          ["Saldo neto del consorcio", $(comp.saldoNeto)],
          ["(−) Expensas emitidas pendientes de cobro", $(-comp.creditos)],
          ["(+) Gastos pendientes de pago", $(comp.deudas)],
        ],
        ["<strong>Caja y bancos al cierre</strong>", `<strong>${$(comp.fondosFinal)}</strong>`],
      )}</div></div>
      <p class="muted small">Los gastos del ejercicio se cubren con las expensas ordinarias y extraordinarias liquidadas; el saldo que queda corresponde al fondo de reserva, los intereses cobrados y los redondeos. Caja y bancos al cierre es menor cuando hay expensas emitidas pendientes de cobro cuyos gastos ya se pagaron (por ejemplo, la liquidación del último mes, que se emite y cobra después del cierre): mientras tanto, esos gastos se financian con los fondos del consorcio.</p>`
    : `<p class="muted">No se puede calcular sin los saldos de apertura.</p>`;

  // 2. Caja y bancos
  const fondos = tabla(
    ["Cuenta", ["Inicial", "num"], ["Cobranzas", "num"], ["Pagos", "num"], ["Ajustes", "num"], ["Final", "num"]],
    s.fondos.map((f) => [esc(f.nombre), $(f.inicial), $(f.cobranzas), $(f.pagos), $(f.ajustes), $(f.finalCalculado)]),
  );

  // 3. Por mes
  const porMes = tabla(
    ["Mes", ["Cobranzas", "num"], ["Intereses", "num"], ["Pagos de gastos", "num"], ["Resultado", "num"]],
    s.porMes.map((m) => [
      mes(m.mes),
      $(m.cobranzasCapital),
      $(m.cobranzasInteres),
      $(m.egresos),
      $(m.cobranzasCapital + m.cobranzasInteres - m.egresos),
    ]),
    ["<strong>Total</strong>", $(s.totales.cobranzasCapital), $(s.totales.cobranzasInteres), $(s.totales.egresos), $(cobrado - s.totales.egresos)],
  );

  // 4. Gastos por rubro
  const rubros = tabla(
    ["Tipo", "Rubro", ["Cant.", "num"], ["Devengado", "num"], ["Pagado", "num"], ["Pendiente", "num"]],
    s.gastosPorRubro.map((r) => [
      r.tipoExpensa === "EXTRAORDINARIA" ? "Extraordinaria" : "Ordinaria",
      esc(r.rubro),
      String(r.cantidad),
      $(r.devengado),
      $(r.pagado),
      $(r.pendiente),
    ]),
    [
      "<strong>Total</strong>",
      "",
      String(s.gastosPorRubro.reduce((a, r) => a + r.cantidad, 0)),
      $(s.gastosDevengados),
      $(s.gastosPorRubro.reduce((a, r) => a + r.pagado, 0)),
      $(s.gastosPorRubro.reduce((a, r) => a + r.pendiente, 0)),
    ],
  );

  // 5. Detalle de gastos e índice de comprobantes
  const detalle = tabla(
    ["N.º", "Fecha", "Período", "Concepto / proveedor", "Rubro", ["Importe", "num"], "Comprobante"],
    s.gastosDetalle.map((g) => [
      String(g.id),
      formatFechaCalendarioAR(g.fecha),
      mes(g.periodo),
      `${esc(g.concepto)}${g.proveedor ? `<br><span class="muted">${esc(g.proveedor)}</span>` : ""}`,
      esc(g.rubro),
      `${$(g.monto)}${g.pagado < g.monto ? `<br><span class="muted">pagado ${$(g.pagado)}</span>` : ""}`,
      g.comprobante
        ? `<span class="ok">${anexoPorGasto.has(g.id) ? `Anexo ${esc(anexoPorGasto.get(g.id)?.codigo)}` : "Adjunto"}</span><br><span class="muted small">${esc(g.comprobante)}</span>`
        : g.motivoSinComprobante
          ? `<span class="muted">Sin comprobante: ${esc(g.motivoSinComprobante)}</span>`
          : `<span class="warn">Falta comprobante</span>`,
    ]),
    undefined,
    "detalle",
  ).replace(
    "</tbody>",
    `<tr class="total"><td></td><td></td><td></td><td><strong>Total (${s.gastosDetalle.length} gastos)</strong></td><td></td><td class="num"><strong>${$(
      s.gastosDevengados,
    )}</strong></td><td></td></tr></tbody>`,
  );

  // 6. Liquidaciones
  const liquidaciones = tabla(
    ["Período", ["Ordinarias", "num"], ["Extraord.", "num"], ["F. reserva", "num"], ["Deuda trasl.", "num"], ["Emitido", "num"]],
    s.liquidaciones.map((l) => [
      mes(l.periodo),
      $(l.ordinarias),
      $(l.extraordinarias),
      $(l.fondoReserva),
      l.deudaTrasladada ? $(l.deudaTrasladada) : "—",
      $(l.emitido),
    ]),
    [
      "<strong>Total</strong>",
      $(s.liquidaciones.reduce((a, l) => a + l.ordinarias, 0)),
      $(s.liquidaciones.reduce((a, l) => a + l.extraordinarias, 0)),
      $(s.fondoReservaLiquidado),
      $(s.deudaTrasladadaTotal),
      $(s.emitidoTotal),
    ],
  );

  // 7. Por unidad
  const unidades = tabla(
    ["Unidad", ["Emitido en el ejercicio", "num"], ["Cobrado en el ejercicio", "num"], ["Pendiente al cierre", "num"]],
    s.resumenUnidades.map((u) => [esc(u.unidad), $(u.emitido), $(u.cobrado), $(u.saldo)]),
    [
      "<strong>Total</strong>",
      $(s.resumenUnidades.reduce((a, u) => a + u.emitido, 0)),
      $(s.resumenUnidades.reduce((a, u) => a + u.cobrado, 0)),
      $(s.creditosTotal),
    ],
  );

  // 8. Deudas
  const deudas =
    s.deudasProveedores.length === 0
      ? `<p class="muted">Sin gastos pendientes de pago al cierre.</p>`
      : tabla(
          ["N.º", "Período", "Concepto / proveedor", ["Pendiente", "num"]],
          s.deudasProveedores.map((d) => [
            String(d.id),
            esc(d.periodo),
            `${esc(d.concepto)}${d.proveedor ? `<br><span class="muted">${esc(d.proveedor)}</span>` : ""}`,
            $(d.pendiente),
          ]),
          ["", "", "<strong>Total</strong>", $(s.deudaProveedoresTotal)],
        );

  const notas = [
    `Saldos de apertura: ${
      ejercicio.aperturaEstado === "CERO_CONFIRMADO"
        ? "cero en caja, bancos, créditos y deudas, según declaración del administrador."
        : s.apertura
          ? `${textoOrigenApertura(s.apertura)}: caja y bancos ${$(s.fondosInicial)}, expensas pendientes de cobro ${$(
              s.apertura.creditosTotal,
            )} y gastos pendientes de pago ${$(s.apertura.deudasTotal)} (saldo neto ${$(s.apertura.saldoNeto)}).`
          : "pendientes de detalle; el saldo final de caja y bancos no se informa."
    }`,
    "Cobranzas y pagos se imputan por fecha efectiva dentro del ejercicio. Gastos y liquidaciones se imputan por período (mes), aunque la liquidación del último mes se emita después del cierre.",
    "Las expensas pendientes al cierre se informan por su capital, sin intereses no liquidados. La deuda de un mes incluida en una liquidación posterior se cuenta una sola vez.",
    "El importe emitido por unidad incluye la deuda de meses anteriores que se volvió a liquidar (columna «Deuda trasl.» de las liquidaciones).",
    "El fondo de reserva liquidado se integra en los fondos del consorcio; su cobro y aplicación no se registran por separado.",
    ...informativas.map((i) => i.nota ?? `${i.titulo}: ${i.detalle}`),
  ];

  const notasAdmin = parrafosNotas(datos.notasAdministrador);

  const anexo =
    datos.anexo.length === 0
      ? ""
      : `<h2>11. Anexo de comprobantes</h2>
  <p class="muted small">Los comprobantes se agregan a continuación, en este orden. Un comprobante que respalda más de un gasto (por ejemplo, una factura pagada en cuotas) se incluye una sola vez.</p>
  ${tabla(
    ["Anexo", "Gastos N.º", "Archivo"],
    datos.anexo.map((a) => [
      `<strong>${esc(a.codigo)}</strong>`,
      a.gastoIds.join(", "),
      `${esc(a.nombre)}${a.incorporado ? "" : ' <span class="warn">(no se pudo incorporar: consultarlo en el sistema)</span>'}`,
    ]),
  )}`;

  const version = datos.version
    ? `<div><b>Versión:</b> N.º ${datos.version.numero}, confirmada el ${fechaHoraAR(datos.version.confirmadoAt)}${
        datos.version.confirmadoPor ? ` por ${esc(datos.version.confirmadoPor)}` : ""
      }</div><div><b>Huella:</b> <span class="small">${esc(datos.version.huella.slice(0, 16))}</span></div>`
    : `<div><b>Estado:</b> borrador sin confirmar</div><div></div>`;

  const firma = datos.administrador
    ? `<div class="firma">
        ${datos.administrador.firmaDataUri ? `<img src="${datos.administrador.firmaDataUri}" alt="Firma" />` : `<div class="espacio-firma"></div>`}
        <div class="linea-firma">${esc(datos.administrador.firmaAclaracion || datos.administrador.nombre)}</div>
        <div class="muted">${esc(datos.administrador.firmaRol || "Administrador")}</div>
      </div>`
    : `<div class="firma"><div class="espacio-firma"></div><div class="linea-firma">Administrador</div></div>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #0f172a; margin: 0; }
  header.portada { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  h2 { font-size: 11.5pt; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #cbd5e1; break-after: avoid; }
  .sub { color: #334155; margin: 2px 0; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; margin-top: 8px; font-size: 9pt; }
  .meta b { color: #475569; font-weight: normal; }
  .aviso { margin: 10px 0; padding: 7px 10px; border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; font-size: 8.5pt; }
  .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 2px; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .02em; color: #475569; border-bottom: 1px solid #94a3b8; padding: 4px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr { break-inside: avoid; }
  tfoot td { border-top: 1.5px solid #0f172a; border-bottom: none; font-weight: bold; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .muted { color: #64748b; }
  .small { font-size: 7.5pt; }
  .ok { color: #047857; }
  .warn { color: #b91c1c; font-weight: bold; }
  table.detalle { table-layout: fixed; font-size: 8.5pt; }
  table.detalle th:nth-child(1) { width: 5%; } table.detalle th:nth-child(2) { width: 11%; }
  table.detalle th:nth-child(3) { width: 9%; } table.detalle th:nth-child(4) { width: 31%; }
  table.detalle th:nth-child(5) { width: 14%; } table.detalle th:nth-child(6) { width: 12%; }
  table.detalle th:nth-child(7) { width: 18%; }
  table.detalle td { word-wrap: break-word; }
  table.detalle tr.total td { border-top: 1.5px solid #0f172a; border-bottom: none; }
  td.nowrap, table.detalle td:nth-child(3) { white-space: nowrap; }
  ol.notas { padding-left: 18px; margin: 4px 0; } ol.notas li { margin: 3px 0; }
  h3 { font-size: 10pt; margin: 12px 0 4px; break-after: avoid; }
  p.nota-admin { margin: 4px 0; line-height: 1.45; }
  .firma { margin: 14px 0 0 auto; width: 240px; text-align: center; break-inside: avoid; }
  .firma img { max-height: 56px; max-width: 220px; }
  .espacio-firma { height: 44px; }
  .linea-firma { border-top: 1px solid #0f172a; padding-top: 4px; }
</style>
</head>
<body>
  <header class="portada">
    <h1>Rendición de cuentas</h1>
    <p class="sub"><strong>${esc(c.tituloLegal || c.nombre)}</strong>${c.tituloLegal ? ` (${esc(c.nombre)})` : ""}</p>
    <div class="meta">
      <div><b>Ejercicio N.º ${ejercicio.numero}:</b> ${periodo}</div>
      <div><b>Domicilio:</b> ${esc(ubicacion)}</div>
      <div><b>Administrador:</b> ${esc(datos.administrador?.nombre ?? "—")}</div>
      <div><b>CUIT:</b> ${esc(c.cuit ?? "—")}</div>
      <div><b>Emitida:</b> ${fechaHoraAR(datos.emitidaAt)}</div>
      <div><b>Vencimiento de la rendición:</b> ${formatFechaCalendarioAR(datos.vencimientoRendicion)}</div>
      ${version}
    </div>
    <p class="muted small" style="margin-top:8px">Rendición documentada en los términos del art. 2067 inc. e del Código Civil y Comercial. Información elaborada a partir de los registros del sistema; no constituye estados contables auditados.</p>
  </header>

  ${
    pendientes.length > 0
      ? `<div class="aviso"><strong>Observaciones pendientes:</strong> ${pendientes.map((p) => esc(p.titulo)).join("; ")}.</div>`
      : ""
  }

  <h2>1. Resumen del ejercicio</h2>
  <div class="dos"><div>${resumen}</div><div>${situacion}</div></div>

  <h2>2. Composición del saldo</h2>
  ${composicion}

  <h2>3. Caja y bancos</h2>
  ${fondos}

  <h2>4. Ingresos y egresos por mes</h2>
  ${porMes}

  <h2>5. Gastos por rubro</h2>
  ${rubros}

  <h2>6. Liquidaciones emitidas</h2>
  ${liquidaciones}

  <h2>7. Estado por unidad</h2>
  ${unidades}

  <h2>8. Gastos pendientes de pago al cierre</h2>
  ${deudas}

  <h2>9. Detalle de gastos e índice de comprobantes</h2>
  ${detalle}

  <h2>10. Notas</h2>
  <ol class="notas">${notas.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
  ${
    notasAdmin.length > 0
      ? `<h3>Notas del administrador</h3>${notasAdmin.map((p) => `<p class="nota-admin">${esc(p).replace(/\r?\n/g, "<br>")}</p>`).join("")}`
      : ""
  }

  ${firma}

  ${anexo}
</body>
</html>`;
}
