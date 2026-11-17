import { formatFechaCalendarioAR } from "./ejercicios";
import type { DatosRendicion } from "./rendicion-pdf-html";

// Hoja para pegar en el Libro de Administración rubricado: asiento de cierre del
// ejercicio en una sola página. Se imprime en A4 a tamaño real; las marcas de
// corte delimitan el área útil del libro (ANCHO_MM x ALTO_MM), centrada en la hoja.

export const HOJA_LIBRO_ANCHO_MM = 200;
export const HOJA_LIBRO_ALTO_MM = 290;

function esc(valor: string | null | undefined) {
  return (valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const numero = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : numero.format(v));

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mes = (aaaamm: string) => {
  const [a, m] = aaaamm.split("-");
  return `${MESES[Number(m) - 1] ?? m} ${a}`;
};

export function buildLibroAdministracionHtml(datos: DatosRendicion) {
  const s = datos.simulacion;
  const { ejercicio } = s;
  const c = datos.consorcio;
  const periodo = `${formatFechaCalendarioAR(ejercicio.fechaInicio)} al ${formatFechaCalendarioAR(ejercicio.fechaFin)}`;
  const ubicacion = [c.direccion, c.ciudad, c.provincia].filter(Boolean).join(", ");
  const pendientes = s.inconsistencias.filter((i) => i.gravedad !== "INFO");

  // 1. Movimiento de fondos por mes, con saldo acumulado.
  let saldo = s.fondosInicial;
  const filasMes = s.porMes.map((m) => {
    const neto = m.cobranzasCapital + m.cobranzasInteres - m.egresos + m.ajustes;
    saldo = saldo === null ? null : Math.round((saldo + neto) * 100) / 100;
    return `<tr><td>${mes(m.mes)}</td><td class="num">${n(m.cobranzasCapital)}</td><td class="num">${n(
      m.cobranzasInteres,
    )}</td><td class="num">${n(m.egresos)}</td><td class="num">${m.ajustes ? n(m.ajustes) : "—"}</td><td class="num">${n(saldo)}</td></tr>`;
  });
  const t = s.totales;

  // 2. Saldos por cuenta al cierre (se omiten cuentas sin movimientos ni saldo).
  const cuentas = s.fondos.filter((f) => f.movimientosPeriodo > 0 || (f.finalCalculado ?? 0) !== 0);

  // 3. Gastos sin comprobante, agrupados por motivo.
  const sinComprobante = new Map<string, { cantidad: number; monto: number }>();
  for (const g of s.gastosDetalle) {
    if (g.comprobante) continue;
    const clave = g.motivoSinComprobante ?? "Sin motivo informado";
    const fila = sinComprobante.get(clave) ?? { cantidad: 0, monto: 0 };
    fila.cantidad += 1;
    fila.monto += g.monto;
    sinComprobante.set(clave, fila);
  }
  const conComprobante = s.gastosDetalle.filter((g) => g.comprobante);
  const devengadoPorTipo = (tipo: string) =>
    s.gastosPorRubro.filter((r) => (r.tipoExpensa === "EXTRAORDINARIA") === (tipo === "EXTRAORDINARIA")).reduce((a, r) => a + r.devengado, 0);

  const comp = s.composicion;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.4pt; color: #0f172a; }
  .hoja { position: relative; width: ${HOJA_LIBRO_ANCHO_MM}mm; height: ${HOJA_LIBRO_ALTO_MM}mm; margin: ${(297 - HOJA_LIBRO_ALTO_MM) / 2}mm auto 0; padding: 9mm 10mm 8mm; overflow: hidden; }
  .corte { position: absolute; width: 5mm; height: 5mm; border-color: #94a3b8; border-style: solid; border-width: 0; }
  .corte.si { top: 0; left: 0; border-top-width: .3mm; border-left-width: .3mm; }
  .corte.sd { top: 0; right: 0; border-top-width: .3mm; border-right-width: .3mm; }
  .corte.ii { bottom: 0; left: 0; border-bottom-width: .3mm; border-left-width: .3mm; }
  .corte.id { bottom: 0; right: 0; border-bottom-width: .3mm; border-right-width: .3mm; }
  .cab { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #0f172a; padding-bottom: 5px; margin-bottom: 6px; }
  .libro { font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; color: #475569; }
  h1 { font-size: 12.5pt; margin: 2px 0 3px; }
  .folio { font-size: 8.5pt; white-space: nowrap; }
  .meta { font-size: 8pt; color: #334155; line-height: 1.35; }
  h2 { font-size: 9pt; margin: 8px 0 3px; text-transform: uppercase; letter-spacing: .03em; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 7.2pt; text-transform: uppercase; color: #475569; border-bottom: 1px solid #64748b; padding: 2px 4px; }
  th.num { text-align: right; }
  td { padding: 1.8px 4px; border-bottom: 1px solid #e2e8f0; }
  tr.total td { border-top: 1.2px solid #0f172a; border-bottom: none; font-weight: bold; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8mm; }
  .muted { color: #64748b; }
  .aviso { margin: 4px 0; padding: 3px 6px; border: 1px solid #b91c1c; color: #b91c1c; font-weight: bold; font-size: 8pt; }
  .texto { margin: 3px 0; line-height: 1.4; text-align: justify; }
  .linea { display: inline-block; border-bottom: 1px solid #0f172a; min-width: 28mm; }
  .firmas { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16mm; }
  .firma { width: 70mm; text-align: center; border-top: 1px solid #0f172a; padding-top: 3px; }
</style>
</head>
<body>
<div class="hoja">
  <span class="corte si"></span><span class="corte sd"></span><span class="corte ii"></span><span class="corte id"></span>

  <div class="cab">
    <div>
      <div class="libro">Libro de Administración</div>
      <h1>Cierre del Ejercicio N.º ${ejercicio.numero} · ${periodo}</h1>
      <div class="meta">
        <strong>${esc(c.tituloLegal || c.nombre)}</strong> · ${esc(ubicacion)}<br />
        CUIT ${esc(c.cuit ?? "—")} · Administrador: ${esc(datos.administrador?.nombre ?? "—")}
      </div>
    </div>
    <div class="folio">Folio N.º <span class="linea" style="min-width:16mm"></span></div>
  </div>

  ${
    pendientes.length > 0
      ? `<div class="aviso">BORRADOR: hay observaciones pendientes en la simulación del cierre (${pendientes
          .map((p) => esc(p.titulo))
          .join("; ")}). No asentar hasta resolverlas.</div>`
      : ""
  }

  <h2>1. Movimiento de fondos (caja y bancos) en pesos</h2>
  <table>
    <thead><tr><th>Mes</th><th class="num">Cobranzas</th><th class="num">Intereses</th><th class="num">Pagos de gastos</th><th class="num">Ajustes</th><th class="num">Saldo al fin del mes</th></tr></thead>
    <tbody>
      <tr><td>Saldo al inicio (${formatFechaCalendarioAR(ejercicio.fechaInicio)})</td><td></td><td></td><td></td><td></td><td class="num">${n(s.fondosInicial)}</td></tr>
      ${filasMes.join("")}
      <tr class="total"><td>Total del ejercicio</td><td class="num">${n(t.cobranzasCapital)}</td><td class="num">${n(t.cobranzasInteres)}</td><td class="num">${n(
        t.egresos,
      )}</td><td class="num">${t.ajustes ? n(t.ajustes) : "—"}</td><td class="num">${n(s.fondosFinal)}</td></tr>
    </tbody>
  </table>

  <div class="dos">
    <div>
      <h2>2. Saldos al cierre (${formatFechaCalendarioAR(ejercicio.fechaFin)})</h2>
      <table><tbody>
        ${cuentas.map((f) => `<tr><td>${esc(f.nombre)}</td><td class="num">${n(f.finalCalculado)}</td></tr>`).join("")}
        <tr class="total"><td>Caja y bancos</td><td class="num">${n(s.fondosFinal)}</td></tr>
        <tr><td>(+) Expensas emitidas pendientes de cobro</td><td class="num">${n(s.creditosTotal)}</td></tr>
        <tr><td>(−) Gastos pendientes de pago</td><td class="num">${n(-s.deudaProveedoresTotal)}</td></tr>
        <tr class="total"><td>Saldo neto del consorcio</td><td class="num">${n(comp?.saldoNeto ?? null)}</td></tr>
      </tbody></table>
    </div>
    <div>
      <h2>3. Composición del saldo neto</h2>
      ${
        comp
          ? `<table><tbody>
        ${comp.inicial ? `<tr><td>Saldo neto al inicio</td><td class="num">${n(comp.inicial)}</td></tr>` : ""}
        <tr><td>Fondo de reserva liquidado</td><td class="num">${n(comp.fondoReserva)}</td></tr>
        <tr><td>(+) Intereses por mora cobrados</td><td class="num">${n(comp.interesesCobrados)}</td></tr>
        ${comp.interesesEnTraslados ? `<tr><td>(+) Intereses en deudas trasladadas</td><td class="num">${n(comp.interesesEnTraslados)}</td></tr>` : ""}
        <tr><td>(+) Redondeos de liquidaciones</td><td class="num">${n(comp.redondeos)}</td></tr>
        ${Math.abs(comp.otrasDiferencias) >= 0.01 ? `<tr><td>(±) Otras diferencias</td><td class="num">${n(comp.otrasDiferencias)}</td></tr>` : ""}
        <tr class="total"><td>Saldo neto del consorcio</td><td class="num">${n(comp.saldoNeto)}</td></tr>
      </tbody></table>`
          : `<p class="muted">Sin saldos de apertura confirmados.</p>`
      }
    </div>
  </div>

  <div class="dos">
    <div>
      <h2>4. Gastos y liquidaciones del ejercicio</h2>
      <table><tbody>
        <tr><td>Gastos ordinarios devengados</td><td class="num">${n(devengadoPorTipo("ORDINARIA"))}</td></tr>
        ${devengadoPorTipo("EXTRAORDINARIA") ? `<tr><td>Gastos extraordinarios devengados</td><td class="num">${n(devengadoPorTipo("EXTRAORDINARIA"))}</td></tr>` : ""}
        <tr class="total"><td>Total de gastos (${s.gastosDetalle.length})</td><td class="num">${n(s.gastosDevengados)}</td></tr>
        <tr><td>Liquidaciones emitidas (${s.liquidaciones.length})</td><td class="num">${n(s.emitidoTotal)}</td></tr>
        ${s.deudaTrasladadaTotal ? `<tr><td class="muted">incluye deuda trasladada de meses anteriores</td><td class="num muted">${n(s.deudaTrasladadaTotal)}</td></tr>` : ""}
      </tbody></table>
    </div>
    <div>
      <h2>5. Respaldo de los gastos</h2>
      <table><tbody>
        <tr><td>Con comprobante (${conComprobante.length})</td><td class="num">${n(conComprobante.reduce((a, g) => a + g.monto, 0))}</td></tr>
        ${Array.from(sinComprobante.entries())
          .map(([motivo, f]) => `<tr><td>Sin comprobante (${f.cantidad}): ${esc(motivo)}</td><td class="num">${n(f.monto)}</td></tr>`)
          .join("")}
      </tbody></table>
    </div>
  </div>

  <h2>6. Constancias</h2>
  <p class="texto">Asiento de cierre del ejercicio N.º ${ejercicio.numero}. Saldos de apertura: ${
    ejercicio.aperturaEstado === "CERO_CONFIRMADO" ? "cero, primer ejercicio" : "según detalle de apertura"
  }. Importes en pesos según los registros del sistema; cobranzas y pagos por fecha efectiva, gastos y liquidaciones por período. La rendición de cuentas documentada (art. 2067 inc. e CCyC), con el detalle de gastos, el estado por unidad y el índice de comprobantes, se archiva junto con los comprobantes y vence el ${formatFechaCalendarioAR(
    datos.vencimientoRendicion,
  )}.</p>
  <p class="texto">Tratada por la asamblea del <span class="linea"></span> · Libro de Actas, folio <span class="linea" style="min-width:16mm"></span> · Resultado: <span class="linea" style="min-width:40mm"></span></p>

  <div class="firmas">
    <div>Lugar y fecha: <span class="linea" style="min-width:60mm"></span></div>
    <div class="firma">
      ${esc(datos.administrador?.firmaAclaracion || datos.administrador?.nombre || "")}<br />
      <span class="muted">${esc(datos.administrador?.firmaRol || "Administrador")}</span>
    </div>
  </div>
</div>
</body>
</html>`;
}
