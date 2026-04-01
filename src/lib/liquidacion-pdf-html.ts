import { getLiquidacionPaso4Data } from "./liquidacion-paso4";

type LiquidacionData = NonNullable<Awaited<ReturnType<typeof getLiquidacionPaso4Data>>>;

type ProrrateoRow = LiquidacionData["prorrateoRows"][number];

type TitularidadRow = {
  key: string;
  responsables: { id: number; label: string }[];
  unidades: string[];
  coefTotal: number;
  totalPagar: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyNoDecimals(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "decimal",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatCoef(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatPeriodoLabel(periodo: string | null) {
  if (!periodo) return "-";
  const [year, month] = periodo.split("-");
  if (!year || !month) return periodo;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
}

function formatDateLong(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildCompactUbicacion(row: ProrrateoRow) {
  const piso = row.piso?.trim() ?? "";
  const departamento = row.departamento?.trim() ?? "";

  if (piso && departamento) {
    return `${piso}-${departamento}`;
  }

  if (piso) {
    return piso;
  }

  return row.ubicacion;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toMultilineHtml(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function buildOptionalEditableSection(title: string, value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return "";

  return `
    <div class="block-space">
      <div class="subsection-title" style="margin-top:0;">${escapeHtml(title)}</div>
      <div class="editable-text">${toMultilineHtml(normalized)}</div>
    </div>
  `;
}
function buildTitularidadRows(rows: ProrrateoRow[]) {
  const map = new Map<string, TitularidadRow>();

  for (const row of rows) {
    const responsables = [...row.propietariosInfo].sort((a, b) => a.id - b.id);
    const key = responsables.map((r) => r.id).join("|");

    const current = map.get(key);
    if (current) {
      current.unidades.push(row.uf);
      current.coefTotal += row.coeficiente;
      current.totalPagar += row.total;
    } else {
      map.set(key, {
        key,
        responsables,
        unidades: [row.uf],
        coefTotal: row.coeficiente,
        totalPagar: row.total,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aLabel = a.responsables.map((r) => r.label).join(" ");
    const bLabel = b.responsables.map((r) => r.label).join(" ");
    return aLabel.localeCompare(bLabel, "es");
  });
}

function buildStyles() {
  return `
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        color: #0f172a;
        background: #ffffff;
        font-size: 13pt;
        line-height: 1.4;
      }

      .page {
        background: #fff;
        margin: 0 auto 20px auto;
        box-shadow: none;
      }

      .page-portrait {
        width: 980px;
        padding: 32px 30px;
      }

      .title-main {
        font-size: 27pt;
        font-weight: 700;
        text-transform: uppercase;
        margin: 0;
      }

      .header-top {
        display: flex;
        align-items: center;
        gap: 20px;
      }

      .header-logo {
        width: 104px;
        height: 72px;
        object-fit: contain;
        display: block;
        flex: 0 0 auto;
      }

      .header-copy {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
      }

      .subtitle {
        font-size: 13pt;
        margin-top: 6px;
        color: #334155;
      }

      .line {
        margin-top: 10px;
        border-top: 1px solid #cbd5e1;
      }

      .header-grid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 120px 1fr 1fr;
        gap: 14px;
      }

      .header-grid--compact {
        grid-template-columns: 1fr 1fr;
      }

      .logo-placeholder {
        width: 120px;
        height: 80px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
      }

      .section-title {
        margin-top: 16px;
        margin-bottom: 10px;
        font-size: 17pt;
        font-weight: 700;
        color: #0f172a;
      }

      .subsection-title {
        margin-top: 26px;
        margin-bottom: 8px;
        font-size: 15pt;
        font-weight: 700;
        color: #0f172a;
      }

      .first-section {
        font-size: 11pt;
      }

      .first-section .title-main {
        font-size: 25pt;
      }

      .first-section .subtitle {
        font-size: 11pt;
      }

      .first-section .section-title {
        font-size: 15pt;
      }

      .first-section .small {
        font-size: 9pt;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12pt;
      }

      th,
      td {
        padding: 6px 8px;
        border-bottom: 1px solid #e2e8f0;
        vertical-align: top;
      }

      th {
        background: #f8fafc;
        text-align: left;
        font-size: 11pt;
        letter-spacing: 0.02em;
        font-weight: 700;
      }

      .text-right {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .font-bold {
        font-weight: 700;
      }

      .small {
        font-size: 11pt;
        color: #475569;
      }

      .cell-lines div {
        margin: 0;
      }

      .group-title td {
        background: #f1f5f9;
        font-weight: 700;
        color: #0f172a;
      }

      .rubro-title td {
        background: #f8fafc;
        font-weight: 600;
        color: #1e293b;
      }

      .subtotal-row td {
        background: #f8fafc;
        font-weight: 600;
        color: #334155;
      }

      .totals-row td {
        background: #e2e8f0;
        font-weight: 700;
        border-top: 1px solid #cbd5e1;
      }

      .total-prorratear-row td {
        background: #e8edf4;
        font-weight: 700;
        border-top: 2px solid #64748b;
        border-bottom: 2px solid #64748b;
      }

      .block-space {
        margin-top: 28px;
      }

      .prorrateo-table {
        width: 100%;
        table-layout: fixed;
        font-size: 9pt;
      }

      .prorrateo-table th,
      .prorrateo-table td {
        padding: 4px 6px;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .prorrateo-table th {
        font-size: 8pt;
      }

      .prorrateo-table td {
        font-size: 9pt;
      }

      .col-uf { width: 44px; white-space: nowrap; }
      .col-ubicacion { width: 120px; }
      .col-responsables { width: 160px; }
      .col-coef { width: 52px; }
      .col-num { width: 56px; }
      .col-total { width: 80px; }

      .detalle-gastos-table,
      .resumen-responsables-table,
      .resumen-caja-table,
      .saldos-pendientes-table {
        font-size: 11pt;
      }

      .prorrateo-table tbody .uf-cell,
      .prorrateo-table tbody .responsable-cell,
      .prorrateo-table tbody .total-a-pagar-cell {
        font-size: 11pt;
      }

      .prorrateo-table tbody .coef-cell {
        font-size: 9pt;
      }

      .prorrateo-table tbody .total-a-pagar-cell {
        font-weight: 700;
      }

      .nowrap { white-space: nowrap; }

      .responsables-cell {
        white-space: normal;
      }

      .total-a-pagar {
        font-weight: 700;
        font-size: 11pt;
      }

      .editable-text {
        white-space: normal;
        color: #1e293b;
      }

      .page-break {
        break-before: page;
        page-break-before: always;
      }

      @page { size: A4 portrait; margin: 10mm; }

      @media print {
        body { background: #ffffff; }
        .page { margin: 0; box-shadow: none; }
        .page-break { height: 0; margin: 0; }
      }
    </style>
  `;
}
function buildHeader(data: LiquidacionData) {
  const mesCierre = formatPeriodoLabel(data.liquidacion.mesRendicion ?? data.liquidacion.periodo);
  const fechaVencimiento = formatDateLong(data.liquidacion.fechaVencimiento ?? null);
  const brandingLogoUrl = "https://app.amiconsorcio.com.ar/branding/logo-gray-v2.png";
  const admin = data.liquidacion.consorcio.administradores[0]?.persona;
  const domicilio = [
    data.liquidacion.consorcio.direccion,
    [data.liquidacion.consorcio.ciudad, data.liquidacion.consorcio.provincia].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");

  return `
    <div class="first-section">
    <div class="header-top">
      <img class="header-logo" src="${brandingLogoUrl}" alt="AmiConsorcio" />
      <div class="header-copy">
        <h1 class="title-main">LIQUIDACION DE EXPENSAS</h1>
        <p class="subtitle">MES DE LIQUIDACION (CIERRE): ${escapeHtml(mesCierre)} - FECHA DE VENCIMIENTO DE LAS EXPENSAS: ${escapeHtml(fechaVencimiento)}</p>
      </div>
    </div>
    <div class="line"></div>
    <div class="header-grid header-grid--compact">
      <div>
        <div class="font-bold">ADMINISTRADOR</div>
        <div class="font-bold">${escapeHtml(admin ? `${admin.nombre} ${admin.apellido}` : "Administrador no asignado")}</div>
        <div class="small">Tel: ${escapeHtml(admin?.telefono ?? "-")}</div>
        <div class="small">Email: ${escapeHtml(admin?.email ?? "-")}</div>
      </div>
      <div>
        <div class="font-bold">${escapeHtml(data.liquidacion.consorcio.nombre)}</div>
        <div class="small" style="text-transform: uppercase;">${escapeHtml(data.liquidacion.consorcio.tituloLegal ?? "-")}</div>
        <div class="small">CUIT: ${escapeHtml(data.liquidacion.consorcio.cuit ?? "-")}</div>
        <div class="small">${escapeHtml(domicilio)}</div>
      </div>
    </div>
    <div class="section-title">Detalle de gastos, ingresos y saldos de ${escapeHtml(mesCierre)}</div>
    </div>
  `;
}

function buildGastosTable(data: LiquidacionData) {
  const gastos = data.gastos;
  const ordinarios = gastos.filter((g) => g.tipoExpensa === "ORDINARIA");
  const extraordinarios = gastos.filter((g) => g.tipoExpensa === "EXTRAORDINARIA");
  const fondo = data.liquidacion.montoFondoReserva ?? 0;

  const groupRows = (rows: typeof gastos) => {
    const map = new Map<string, typeof gastos>();
    for (const row of rows) {
      const rubro = row.rubroExpensa?.trim() || "Sin rubro";
      if (!map.has(rubro)) map.set(rubro, []);
      map.get(rubro)?.push(row);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "es"));
  };

  const renderGroup = (title: string, grouped: ReturnType<typeof groupRows>) => {
    if (grouped.length === 0) {
      return `
        <tr class="group-title"><td colspan="2">${title}</td></tr>
        <tr><td colspan="2" class="small">Sin gastos.</td></tr>
      `;
    }

    const lines = grouped
      .map(([rubro, rows]) => {
        const subtotal = rows.reduce((acc, row) => acc + row.monto, 0);
        const items = rows
          .map((row) => {
            const prov = row.proveedor?.nombre ? ` - ${escapeHtml(row.proveedor.nombre)}` : "";
            const desc = row.descripcion ? `<div class="small">${escapeHtml(row.descripcion)}</div>` : "";
            return `<tr><td><div><span class="font-bold">${escapeHtml(row.concepto)}</span>${prov}</div>${desc}</td><td class="text-right">${escapeHtml(formatCurrency(row.monto))}</td></tr>`;
          })
          .join("");
        return `<tr class="rubro-title"><td colspan="2">${escapeHtml(rubro)}</td></tr>${items}<tr class="subtotal-row"><td class="text-right">SUBTOTAL ${escapeHtml(rubro.toUpperCase())}</td><td class="text-right">${escapeHtml(formatCurrency(subtotal))}</td></tr>`;
      })
      .join("");

    return `<tr class="group-title"><td colspan="2">${title}</td></tr>${lines}`;
  };

  const total = ordinarios.reduce((a, b) => a + b.monto, 0) + extraordinarios.reduce((a, b) => a + b.monto, 0) + fondo;

  return `
    <table class="gastos-table detalle-gastos-table">
      <thead>
        <tr><th>DESCRIPCION</th><th class="text-right">IMPORTE</th></tr>
      </thead>
      <tbody>
        ${renderGroup("GASTOS ORDINARIOS", groupRows(ordinarios))}
        ${renderGroup("GASTOS EXTRAORDINARIOS", groupRows(extraordinarios))}
        <tr class="subtotal-row"><td class="font-bold">Aporte al fondo de reserva</td><td class="text-right">${escapeHtml(formatCurrency(fondo))}</td></tr>
        <tr class="total-prorratear-row"><td>TOTAL A PRORRATEAR</td><td class="text-right">${escapeHtml(formatCurrency(total))}</td></tr>
      </tbody>
    </table>
  `;
}

function buildProrrateoTable(data: LiquidacionData) {
  const rows = data.prorrateoRows;

  const totals = rows.reduce(
    (acc, row) => {
      acc.coef += row.coeficiente;
      acc.saldoAnterior += row.saldoAnterior;
      acc.pagos += row.pagosPeriodo;
      acc.saldoRemanente += row.saldoDeudor;
      acc.expensasMes += row.expensasDelMes;
      acc.fondoReserva += row.fondoReserva;
      acc.intereses += row.intereses;
      acc.ajuste += row.ajuste;
      acc.total += row.total;
      return acc;
    },
    {
      coef: 0,
      saldoAnterior: 0,
      pagos: 0,
      saldoRemanente: 0,
      expensasMes: 0,
      fondoReserva: 0,
      intereses: 0,
      ajuste: 0,
      total: 0,
    },
  );

  const body = rows
    .map((row) => {
      const responsables = (row.propietarios?.length ? row.propietarios : [row.propietario])
        .map((r) => `<div>${escapeHtml(r)}</div>`)
        .join("");
      return `
        <tr>
          <td class="col-uf nowrap uf-cell">${escapeHtml(row.uf)}</td>
          <td class="col-ubicacion">${escapeHtml(buildCompactUbicacion(row))}</td>
          <td class="col-responsables cell-lines responsables-cell responsable-cell">${responsables}</td>
          <td class="col-coef text-right coef-cell">${escapeHtml(formatCoef(row.coeficiente))}</td>
          <td class="col-num text-right">${escapeHtml(formatCurrencyNoDecimals(row.saldoAnterior))}</td>
          <td class="col-num text-right">${escapeHtml(formatCurrencyNoDecimals(row.pagosPeriodo))}</td>
          <td class="col-num text-right">${escapeHtml(formatCurrencyNoDecimals(row.saldoDeudor))}</td>
          <td class="col-num text-right">${escapeHtml(formatCurrencyNoDecimals(row.expensasDelMes))}</td>
          <td class="col-num text-right">${escapeHtml(formatCurrencyNoDecimals(row.fondoReserva))}</td>
          <td class="col-num text-right">${escapeHtml(formatCurrencyNoDecimals(row.intereses))}</td>
          <td class="col-num text-right">${escapeHtml(formatCurrencyNoDecimals(row.ajuste))}</td>
          <td class="col-total text-right font-bold total-a-pagar total-a-pagar-cell">${escapeHtml(formatCurrencyNoDecimals(row.total))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="section-title" style="margin-top:24px;">ESTADO DE CUENTAS Y PRORRATEO DE EXPENSAS</div>
    <table class="prorrateo-table">
      <thead>
        <tr>
          <th class="col-uf">U.F.</th><th class="col-ubicacion">UBICACION</th><th class="col-responsables">RESPONSABLE</th><th class="col-coef text-right">COEF.</th>
          <th class="col-num text-right">SALDO ANTERIOR</th><th class="col-num text-right">PAGOS</th><th class="col-num text-right">SALDO REMANENTE</th>
          <th class="col-num text-right">EXPENSAS DEL MES</th><th class="col-num text-right">FONDO DE RESERVA</th><th class="col-num text-right">INTERESES</th>
          <th class="col-num text-right">AJUSTE</th><th class="col-total text-right">TOTAL A PAGAR</th>
        </tr>
      </thead>
      <tbody>
        ${body}
        <tr class="totals-row">
          <td colspan="3">TOTALES GENERALES</td>
          <td class="text-right">${escapeHtml(formatCoef(totals.coef))}</td>
          <td class="text-right">${escapeHtml(formatCurrencyNoDecimals(totals.saldoAnterior))}</td>
          <td class="text-right">${escapeHtml(formatCurrencyNoDecimals(totals.pagos))}</td>
          <td class="text-right">${escapeHtml(formatCurrencyNoDecimals(totals.saldoRemanente))}</td>
          <td class="text-right">${escapeHtml(formatCurrencyNoDecimals(totals.expensasMes))}</td>
          <td class="text-right">${escapeHtml(formatCurrencyNoDecimals(totals.fondoReserva))}</td>
          <td class="text-right">${escapeHtml(formatCurrencyNoDecimals(totals.intereses))}</td>
          <td class="text-right">${escapeHtml(formatCurrencyNoDecimals(totals.ajuste))}</td>
          <td class="text-right total-a-pagar total-a-pagar-cell">${escapeHtml(formatCurrencyNoDecimals(totals.total))}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function buildThirdPage(data: LiquidacionData) {
  const titularidad = buildTitularidadRows(data.prorrateoRows);

  const titularidadBody = titularidad
    .map((row) => {
      const responsables = row.responsables.map((r) => `<div>${escapeHtml(r.label)}</div>`).join("");
      return `<tr><td class="cell-lines">${responsables}</td><td class="nowrap">${escapeHtml(row.unidades.join(", "))}</td><td class="text-right">${escapeHtml(formatCoef(row.coefTotal))}</td><td class="text-right font-bold">${escapeHtml(formatCurrency(row.totalPagar))}</td></tr>`;
    })
    .join("");

  const titularidadTotals = titularidad.reduce(
    (acc, row) => {
      acc.coef += row.coefTotal;
      acc.total += row.totalPagar;
      return acc;
    },
    { coef: 0, total: 0 },
  );

  const saldoCajaPeriodoAnterior = 0;
  const ingresosPorCobranza = data.totalCobranzas;
  const egresosPorGastos = data.totalGastos;
  const egresosPorGastosParticulares = data.gastos
    .filter((g) => g.rubroExpensa.toLowerCase().includes("particular"))
    .reduce((acc, g) => acc + g.monto, 0);
  const saldoCajaEnContraDelConsorcio =
    saldoCajaPeriodoAnterior + ingresosPorCobranza - egresosPorGastos - egresosPorGastosParticulares;

  const saldosPendientes = data.prorrateoRows.filter((row) => row.saldoDeudor > 0);
  const totalSaldosDeudores = saldosPendientes.reduce((acc, row) => acc + row.saldoDeudor, 0);

  const pendientesBody = saldosPendientes
    .map((row) => {
      const responsables = (row.propietarios?.length ? row.propietarios : [row.propietario])
        .map((r) => `<div>${escapeHtml(r)}</div>`)
        .join("");
      return `<tr><td>${escapeHtml(row.uf)}</td><td>${escapeHtml(row.ubicacion)}</td><td class="cell-lines">${responsables}</td><td class="text-right font-bold">${escapeHtml(formatCurrency(row.saldoDeudor))}</td></tr>`;
    })
    .join("");

  const editableSections = [
    buildOptionalEditableSection("DATOS DE JUICIOS", data.liquidacion.datosJuicios),
    buildOptionalEditableSection(
      "RECOMENDACIONES GENERALES Y PERMANENTES",
      data.liquidacion.recomendacionesGenerales,
    ),
    buildOptionalEditableSection("NOVEDADES DEL MES", data.liquidacion.novedadesMes),
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="section-title" style="margin-top:32px;">RESUMEN POR RESPONSABLES</div>
    <table class="resumen-responsables-table">
      <thead><tr><th>RESPONSABLES</th><th>UNIDADES</th><th class="text-right">COEFICIENTE TOTAL</th><th class="text-right">TOTAL A PAGAR</th></tr></thead>
      <tbody>
        ${titularidadBody}
        <tr class="totals-row"><td colspan="2">TOTALES GENERALES</td><td class="text-right">${escapeHtml(formatCoef(titularidadTotals.coef))}</td><td class="text-right">${escapeHtml(formatCurrency(titularidadTotals.total))}</td></tr>
      </tbody>
    </table>

    <div class="block-space">
      <div class="subsection-title">RESUMEN DE CAJA DEL PERIODO</div>
      <table class="resumen-caja-table">
        <thead><tr><th>DESCRIPCION</th><th class="text-right">IMPORTE</th></tr></thead>
        <tbody>
          <tr><td>Saldo de caja del periodo anterior</td><td class="text-right">${escapeHtml(formatCurrency(saldoCajaPeriodoAnterior))}</td></tr>
          <tr><td>Mas ingresos del periodo por cobranza</td><td class="text-right">${escapeHtml(formatCurrency(ingresosPorCobranza))}</td></tr>
          <tr><td>Menos total de egresos por gastos</td><td class="text-right">${escapeHtml(formatCurrency(egresosPorGastos))}</td></tr>
          <tr><td>Menos egresos por gastos particulares</td><td class="text-right">${escapeHtml(formatCurrency(egresosPorGastosParticulares))}</td></tr>
          <tr class="totals-row"><td>SALDO DE CAJA EN CONTRA DEL CONSORCIO</td><td class="text-right">${escapeHtml(formatCurrency(saldoCajaEnContraDelConsorcio))}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="block-space">
      <div class="subsection-title">SALDOS PENDIENTES DE PAGO</div>
      <table class="saldos-pendientes-table">
        <thead><tr><th>COD</th><th>UBICACION</th><th>RESPONSABLES</th><th class="text-right">TOTAL</th></tr></thead>
        <tbody>
          ${pendientesBody || '<tr><td colspan="4" class="small">Sin saldos pendientes.</td></tr>'}
          <tr class="totals-row"><td colspan="3">Total de saldos deudores</td><td class="text-right">${escapeHtml(formatCurrency(totalSaldosDeudores))}</td></tr>
        </tbody>
      </table>
    </div>

    ${editableSections}
  `;
}
export function buildLiquidacionPdfHtml(data: LiquidacionData) {
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${buildStyles()}
      </head>
      <body>
        <div class="page page-portrait">
          ${buildHeader(data)}
          ${buildGastosTable(data)}
          <div class="block-space">
            ${buildProrrateoTable(data)}
          </div>
        </div>

        <div class="page-break"></div>

        <div class="page page-portrait">
          ${buildThirdPage(data)}
        </div>
      </body>
    </html>
  `;
}







function buildPaso4AdminConsorcioBlock(data: LiquidacionData) {
  const admin = data.liquidacion.consorcio.administradores[0]?.persona;
  const domicilio = [
    data.liquidacion.consorcio.direccion,
    [data.liquidacion.consorcio.ciudad, data.liquidacion.consorcio.provincia].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");

  return `
    <div class="header-grid">
      <div class="logo-placeholder"></div>
      <div>
        <div class="font-bold">ADMINISTRADOR</div>
        <div class="font-bold">${escapeHtml(admin ? `${admin.nombre} ${admin.apellido}` : "Administrador no asignado")}</div>
        <div class="small">Tel: ${escapeHtml(admin?.telefono ?? "-")}</div>
        <div class="small">Email: ${escapeHtml(admin?.email ?? "-")}</div>
      </div>
      <div>
        <div class="font-bold">${escapeHtml(data.liquidacion.consorcio.nombre)}</div>
        <div class="small" style="text-transform: uppercase;">${escapeHtml(data.liquidacion.consorcio.tituloLegal ?? "-")}</div>
        <div class="small">CUIT: ${escapeHtml(data.liquidacion.consorcio.cuit ?? "-")}</div>
        <div class="small">${escapeHtml(domicilio)}</div>
      </div>
    </div>
  `;
}

function buildPaso4SaldosPendientesSection(data: LiquidacionData) {
  const saldosPendientes = data.prorrateoRows.filter((row) => row.saldoDeudor > 0);
  const totalSaldosDeudores = saldosPendientes.reduce((acc, row) => acc + row.saldoDeudor, 0);

  const pendientesBody = saldosPendientes
    .map((row) => {
      const responsables = (row.propietarios?.length ? row.propietarios : [row.propietario])
        .map((r) => `<div>${escapeHtml(r)}</div>`)
        .join("");
      return `<tr><td>${escapeHtml(row.uf)}</td><td>${escapeHtml(row.ubicacion)}</td><td class="cell-lines">${responsables}</td><td class="text-right font-bold">${escapeHtml(formatCurrency(row.saldoDeudor))}</td></tr>`;
    })
    .join("");

  return `
    <div class="subsection-title" style="margin-top:0;">SALDOS PENDIENTES DE PAGO</div>
    <table>
      <thead><tr><th>COD</th><th>UBICACION</th><th>RESPONSABLES</th><th class="text-right">TOTAL</th></tr></thead>
      <tbody>
        ${pendientesBody || '<tr><td colspan="4" class="small">Sin saldos pendientes.</td></tr>'}
        <tr class="totals-row"><td colspan="3">Total de saldos deudores</td><td class="text-right">${escapeHtml(formatCurrency(totalSaldosDeudores))}</td></tr>
      </tbody>
    </table>
  `;
}

function buildPaso4ProveedoresSection(data: LiquidacionData) {
  const body = data.proveedores
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.proveedor)}</td><td>${escapeHtml(p.concepto)}</td><td class="text-right">${escapeHtml(formatCurrency(p.montoPagado))}</td></tr>`,
    )
    .join("");

  return `
    <div class="subsection-title" style="margin-top:0;">LISTADO DE PROVEEDORES</div>
    <table>
      <thead><tr><th>PROVEEDOR</th><th>CONCEPTO</th><th class="text-right">MONTO PAGADO</th></tr></thead>
      <tbody>
        ${body || '<tr><td colspan="3" class="small">Sin proveedores con movimientos en el periodo.</td></tr>'}
      </tbody>
    </table>
  `;
}

export function buildPaso4PreviewStyles() {
  return `
    <style>
      .pdf-section-preview {
        color: #0f172a;
        line-height: 1.35;
        font-family: Arial, sans-serif;
        font-size: 10pt;
      }
      .pdf-section-preview .header-grid { margin-top: 0; display: grid; grid-template-columns: 120px 1fr 1fr; gap: 14px; }
      .pdf-section-preview .logo-placeholder { width: 120px; height: 80px; border: 1px solid #cbd5e1; border-radius: 4px; }
      .pdf-section-preview .line { margin-top: 10px; border-top: 1px solid #cbd5e1; }
      .pdf-section-preview .section-title { margin-top: 16px; margin-bottom: 10px; font-size: 10pt; font-weight: 700; color: #0f172a; }
      .pdf-section-preview .subsection-title { margin-top: 26px; margin-bottom: 8px; font-size: 10pt; font-weight: 700; color: #0f172a; }
      .pdf-section-preview .font-bold { font-weight: 700; }
      .pdf-section-preview .small { font-size: 10pt; color: #475569; }
      .pdf-section-preview table { width: 100%; border-collapse: collapse; font-size: 10pt; }
      .pdf-section-preview th,
      .pdf-section-preview td { font-size: 10pt; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .pdf-section-preview th { background: #f8fafc; text-align: left; letter-spacing: 0.02em; font-weight: 700; }
      .pdf-section-preview .text-right { text-align: right; font-variant-numeric: tabular-nums; }
      .pdf-section-preview .cell-lines div { margin: 0; }
      .pdf-section-preview .group-title td { background: #f1f5f9; font-weight: 700; color: #0f172a; }
      .pdf-section-preview .rubro-title td { background: #f8fafc; font-weight: 600; color: #1e293b; }
      .pdf-section-preview .subtotal-row td { background: #f8fafc; font-weight: 600; color: #334155; }
      .pdf-section-preview .totals-row td { background: #e2e8f0; font-weight: 700; border-top: 1px solid #cbd5e1; }
      .pdf-section-preview .total-prorratear-row td { background: #e8edf4; font-weight: 700; border-top: 2px solid #64748b; border-bottom: 2px solid #64748b; }

      .pdf-section-preview .prorrateo-table { width: 100%; table-layout: fixed; font-size: 10pt; }
      .pdf-section-preview .prorrateo-table th,
      .pdf-section-preview .prorrateo-table td {
        font-size: 10pt;
        padding: 4px 6px;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .pdf-section-preview .col-uf { width: 44px; white-space: nowrap; }
      .pdf-section-preview .col-ubicacion { width: 120px; }
      .pdf-section-preview .col-responsables { width: 160px; }
      .pdf-section-preview .col-coef { width: 52px; }
      .pdf-section-preview .col-num { width: 56px; }
      .pdf-section-preview .col-total { width: 80px; }
    </style>
  `;
}
export function buildPaso4AccordionSectionsHtml(data: LiquidacionData) {
  const mesCierre = formatPeriodoLabel(data.liquidacion.mesRendicion ?? data.liquidacion.periodo);

  return {
    seccion1AdminConsorcio: `<div class="pdf-section-preview">${buildPaso4AdminConsorcioBlock(data)}</div>`,
    seccion2DetalleGastos: `<div class="pdf-section-preview"><div class="section-title" style="margin-top:0;">Detalle de gastos, ingresos y saldos de ${escapeHtml(mesCierre)}</div>${buildGastosTable(data)}</div>`,
    seccion3Prorrateo: `<div class="pdf-section-preview">${buildProrrateoTable(data)}</div>`,
    seccion4SaldosPendientes: `<div class="pdf-section-preview">${buildPaso4SaldosPendientesSection(data)}</div>`,
    seccion5Proveedores: `<div class="pdf-section-preview">${buildPaso4ProveedoresSection(data)}</div>`,
  };
}












































