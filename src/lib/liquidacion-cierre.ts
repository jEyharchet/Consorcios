import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";

import { buildLiquidacionPdfHtml } from "./liquidacion-pdf-html";
import type { getLiquidacionPaso4Data } from "./liquidacion-paso4";
import { buildBankAccountPaymentQr } from "./payment-qr";
import { launchPdfBrowser } from "./pdf-browser";

export type Paso4Data = NonNullable<Awaited<ReturnType<typeof getLiquidacionPaso4Data>>>;

type ProrrateoRow = Paso4Data["prorrateoRows"][number];

type CuentaExpensas = Paso4Data["liquidacion"]["consorcio"]["cuentasBancarias"][number];

export type ArchivoGenerado = {
  tipoArchivo: "RENDICION" | "BOLETA_RESPONSABLE";
  nombreArchivo: string;
  rutaArchivo: string;
  responsableGroupKey: string | null;
};

export type GeneracionArchivosProgressEvent = {
  stage: "GENERATING_RENDICION" | "GENERATING_BOLETAS";
  expectedFiles: number;
  generatedFiles: number;
};

function sanitizeOutputKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 120);
}

export function getLiquidacionesUploadsBaseDir() {
  return process.env.VERCEL
    ? path.join("/tmp", "liquidaciones")
    : path.join(process.cwd(), "public", "uploads", "liquidaciones");
}

type ResponsableGroup = {
  key: string;
  label: string;
  responsables: { id: number; label: string }[];
  unidades: string[];
  coefTotal: number;
  totalPagar: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

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

function formatDate(value: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatPeriodo(periodo: string | null) {
  if (!periodo) return "-";
  const [year, month] = periodo.split("-");
  if (!year || !month) return periodo;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
}

function calcularMontoLuegoVencimiento(totalPagar: number, tasaInteresMensual: number | null | undefined) {
  const tasa = Number(tasaInteresMensual ?? 0);
  if (!Number.isFinite(tasa) || tasa <= 0) {
    return roundMoney(totalPagar);
  }

  return roundMoney(totalPagar * (1 + tasa / 100));
}

function buildResponsableGroups(rows: ProrrateoRow[]): ResponsableGroup[] {
  const map = new Map<string, ResponsableGroup>();

  for (const row of rows) {
    const hasOwnerIds = (row.propietariosInfo?.length ?? 0) > 0;
    const ownersFromInfo = hasOwnerIds
      ? row.propietariosInfo.map((p) => ({ id: p.id, label: p.label }))
      : row.propietarios?.length
        ? row.propietarios.map((label, idx) => ({ id: idx + 1, label }))
        : [{ id: 0, label: row.propietario ?? "Sin responsable" }];

    const owners = ownersFromInfo
      .slice()
      .sort((a, b) => a.id - b.id || a.label.localeCompare(b.label, "es"));

    const key = hasOwnerIds
      ? owners.map((o) => o.id).join("|")
      : `fallback-${slugify(owners.map((o) => o.label).join("-"))}`;
    const label = owners.map((o) => o.label).join(" + ");

    const current = map.get(key);
    if (current) {
      current.unidades.push(row.uf);
      current.coefTotal += row.coeficiente;
      current.totalPagar += row.total;
    } else {
      map.set(key, {
        key,
        label,
        responsables: owners,
        unidades: [row.uf],
        coefTotal: row.coeficiente,
        totalPagar: row.total,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function resolveCuentaBoleta(cuentas: CuentaExpensas[]) {
  return cuentas.find((cuenta) => cuenta.esCuentaExpensas) ?? cuentas.find((cuenta) => cuenta.activa) ?? cuentas[0] ?? null;
}

function buildTransferDetailsHtml(cuentaExpensas: CuentaExpensas, referenciaSugerida: string) {
  return `
    <p><span class="transfer-label">Banco:</span> ${escapeHtml(cuentaExpensas.banco)}</p>
    <p><span class="transfer-label">Titular:</span> ${escapeHtml(cuentaExpensas.titular)}</p>
    ${cuentaExpensas.cuitTitular ? `<p><span class="transfer-label">CUIT:</span> ${escapeHtml(cuentaExpensas.cuitTitular)}</p>` : ""}
    <p><span class="transfer-label">CBU:</span> ${escapeHtml(cuentaExpensas.cbu)}</p>
    <p><span class="transfer-label">Alias:</span> ${escapeHtml(cuentaExpensas.alias ?? "-")}</p>
    <p class="transfer-reference"><span class="transfer-label">Referencia sugerida:</span> ${escapeHtml(referenciaSugerida)}</p>
  `;
}

function buildBasicTransferBlock(transferDetailsHtml: string) {
  return `
    <div class="divider"></div>
    <div class="transfer-block">
      <p class="transfer-title">DATOS DE CUENTA BANCARIA PARA PAGO POR TRANSFERENCIA</p>
      <div class="transfer-details-panel">
        <div class="transfer-grid">
          ${transferDetailsHtml}
        </div>
      </div>
    </div>
  `;
}

function buildBoletaTransferBlock(cuentaExpensas: CuentaExpensas, totalPagar: number, referenciaSugerida: string) {
  const transferDetailsHtml = buildTransferDetailsHtml(cuentaExpensas, referenciaSugerida);
  const fallbackHtml = buildBasicTransferBlock(transferDetailsHtml);

  try {
    const paymentQr = buildBankAccountPaymentQr(cuentaExpensas, totalPagar);

    // Aditivo: si no hay QR utilizable, conservar exactamente el bloque bancario tradicional.
    if (!paymentQr) {
      return fallbackHtml;
    }

    return `
      <div class="divider"></div>
      <div class="transfer-block">
        <p class="transfer-title">DATOS DE CUENTA BANCARIA PARA PAGO POR TRANSFERENCIA</p>
        <div class="transfer-layout">
          <div class="transfer-details-panel">
            <div class="transfer-grid">
              ${transferDetailsHtml}
            </div>
          </div>
          <div class="qr-block">
            <img class="qr-image" src="${escapeHtml(paymentQr.imageUrl)}" alt="QR de pago" />
            <p class="qr-label">${escapeHtml(paymentQr.label)}</p>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("[boleta-qr] buildBankAccountPaymentQr failed", {
      cbu: cuentaExpensas.cbu,
      alias: cuentaExpensas.alias,
      qrEnabled: cuentaExpensas.qrEnabled,
      qrMode: cuentaExpensas.qrMode,
      message: error instanceof Error ? error.message : String(error),
    });
    return fallbackHtml;
  }
}

function buildBoletaHtml(data: Paso4Data, group: ResponsableGroup) {
  const brandingLogoUrl = "https://app.amiconsorcio.com.ar/branding/logo-gray-v2.png";
  const consorcio = data.liquidacion.consorcio;
  const periodo = data.liquidacion.periodo;
  const mesLabel = formatPeriodo(data.liquidacion.mesRendicion ?? periodo);
  const vencimiento = formatDate(data.liquidacion.fechaVencimiento ?? null);
  const montoLuegoVencimiento = calcularMontoLuegoVencimiento(group.totalPagar, data.liquidacion.tasaInteresMensual);
  const cuentaExpensas = resolveCuentaBoleta(consorcio.cuentasBancarias as CuentaExpensas[]);

  const responsablesHtml = group.responsables
    .map((r) => `<div class="responsable-item">${escapeHtml(r.label)}</div>`)
    .join("");

  const unidadesLinea = group.unidades.map((u) => escapeHtml(u)).join(" · ");
  const referenciaSugerida = `${unidadesLinea || "-"} - ${periodo}`;
  const cuentaTransferenciaHtml = cuentaExpensas
    ? buildBoletaTransferBlock(cuentaExpensas, group.totalPagar, referenciaSugerida)
    : "";

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
          }

          .sheet {
            width: 100%;
            max-width: 820px;
            margin: 22px auto;
            padding: 28px 30px 30px;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            background: #ffffff;
            box-sizing: border-box;
          }

          .header {
            padding-bottom: 18px;
            border-bottom: 1px solid #d7dee7;
          }

          .header-logo {
            display: block;
            margin-bottom: 14px;
          }

          .title {
            margin: 0;
            font-size: 21pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            color: #111827;
          }

          .subtitle {
            margin: 10px 0 0 0;
            font-size: 10.5pt;
            color: #334155;
            line-height: 1.45;
          }

          .grid {
            margin-top: 22px;
            display: grid;
            grid-template-columns: 1fr 320px;
            gap: 24px;
            align-items: start;
          }

          .field {
            margin-bottom: 14px;
          }

          .label {
            margin: 0 0 4px 0;
            font-size: 9.5pt;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }

          .value {
            margin: 0;
            font-size: 11.5pt;
            line-height: 1.35;
            color: #0f172a;
          }

          .responsable-item {
            margin: 0 0 2px 0;
            font-size: 11.5pt;
            font-weight: 700;
            line-height: 1.3;
          }

          .divider {
            border-top: 1px solid #cbd5e1;
            margin: 20px 0 0 0;
          }

          .total-block {
            margin-top: 20px;
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: end;
            gap: 18px;
            padding: 18px 0 16px;
            border-top: 2px solid #94a3b8;
            border-bottom: 2px solid #94a3b8;
          }

          .total-label {
            margin: 0;
            font-size: 11pt;
            font-weight: 700;
            text-transform: uppercase;
            color: #334155;
            letter-spacing: 0.02em;
          }

          .total-value {
            margin: 0;
            font-size: 29pt;
            font-weight: 700;
            line-height: 1;
            color: #0f172a;
            white-space: nowrap;
            letter-spacing: -0.02em;
          }

          .total-secondary {
            grid-column: 1 / -1;
            margin-top: 10px;
            padding-top: 12px;
            border-top: 1px solid #dbe3ec;
          }

          .total-secondary-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 16px;
          }

          .total-secondary-label {
            margin: 0;
            font-size: 11pt;
            font-weight: 700;
            color: #334155;
          }

          .total-secondary-value {
            margin: 0;
            font-size: 18pt;
            font-weight: 700;
            line-height: 1.1;
            color: #0f172a;
            white-space: nowrap;
          }

          .total-secondary-note {
            margin: 8px 0 0 0;
            font-size: 9.5pt;
            line-height: 1.4;
            color: #475569;
          }

          .transfer-block {
            margin-top: 18px;
            padding: 16px 18px 18px;
            border: 1px solid #d7dee7;
            border-radius: 10px;
            background: #f8fafc;
          }

          .transfer-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 220px;
            gap: 20px;
            align-items: start;
          }

          .transfer-title {
            margin: 0 0 12px 0;
            font-size: 10.5pt;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: #334155;
          }

          .transfer-details-panel {
            padding: 14px 16px;
            border: 1px solid #dbe3ec;
            border-radius: 8px;
            background: #ffffff;
          }

          .transfer-grid p {
            margin: 0 0 4px 0;
            font-size: 10.5pt;
            color: #0f172a;
            line-height: 1.45;
          }

          .transfer-label {
            font-weight: 700;
            color: #475569;
          }

          .transfer-reference {
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
          }

          .qr-block {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 14px 12px;
            border: 1px solid #dbe3ec;
            border-radius: 8px;
            background: #ffffff;
          }

          .qr-image {
            width: 220px;
            height: 220px;
            object-fit: contain;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 8px;
            box-sizing: border-box;
            background: #ffffff;
          }

          .qr-label {
            margin: 0;
            font-size: 9.5pt;
            font-weight: 700;
            text-align: center;
            color: #0f172a;
            line-height: 1.35;
          }

          .vencimiento {
            font-weight: 700;
            color: #0f172a;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="header">
          <img
            class="header-logo"
            src="${brandingLogoUrl}"
            alt="AmiConsorcio"
            width="140"
            style="display:block;margin-bottom:12px"
          />
          <h1 class="title">VOLANTE DE PAGO DE EXPENSAS</h1>
          <p class="subtitle">${escapeHtml(consorcio.nombre)} · Periodo ${escapeHtml(periodo)} (${escapeHtml(mesLabel)}) · Vence ${escapeHtml(vencimiento)}</p>

          </div>
          <div class="grid">
            <div>
              <div class="field">
                <p class="label">Responsable/s</p>
                ${responsablesHtml}
              </div>

              <div class="field">
                <p class="label">Unidades incluidas</p>
                <p class="value">${unidadesLinea || "-"}</p>
              </div>
            </div>

            <div>
              <div class="field">
                <p class="label">Periodo</p>
                <p class="value">${escapeHtml(periodo)}</p>
              </div>

              <div class="field">
                <p class="label">Vencimiento</p>
                <p class="value vencimiento">${escapeHtml(vencimiento)}</p>
              </div>

              <div class="field">
                <p class="label">Coeficiente total</p>
                <p class="value">${(group.coefTotal * 100).toFixed(2)}%</p>
              </div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="total-block">
            <p class="total-label">Total a pagar</p>
            <p class="total-value">${escapeHtml(formatCurrency(group.totalPagar))}</p>
            <div class="total-secondary">
              <div class="total-secondary-row">
                <p class="total-secondary-label">Monto a pagar luego del vencimiento</p>
                <p class="total-secondary-value">${escapeHtml(formatCurrency(montoLuegoVencimiento))}</p>
              </div>
              <p class="total-secondary-note">En el caso de no pagar antes del vencimiento de siguientes períodos, se sumarán los intereses de las siguientes liquidaciones.</p>
            </div>
          </div>

          ${cuentaTransferenciaHtml}
        </div>
      </body>
    </html>
  `;
}

async function htmlToPdfBuffer(html: string) {
  const browser = await launchPdfBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

export async function generarArchivosLiquidacion(
  data: Paso4Data,
  options?: {
    onProgress?: (event: GeneracionArchivosProgressEvent) => void | Promise<void>;
    outputKey?: string;
  },
): Promise<ArchivoGenerado[]> {
  const consorcioSlug = slugify(data.liquidacion.consorcio.nombre || `consorcio-${data.liquidacion.consorcioId}`);
  const periodoSlug = slugify(data.liquidacion.periodo || "periodo");
  const timestamp = `${Date.now()}`;
  const outputKey = sanitizeOutputKey(options?.outputKey?.trim() || "") || `liquidacion-${data.liquidacion.id}-${timestamp}`;

  const relativeBase = `/uploads/liquidaciones/${outputKey}`;
  const outputBase = path.join(
    getLiquidacionesUploadsBaseDir(),
    outputKey,
  );

  await mkdir(outputBase, { recursive: true });

  const archivos: ArchivoGenerado[] = [];
  const groups = buildResponsableGroups(data.prorrateoRows);
  const expectedFiles = 1 + groups.length;

  try {
    if (options?.onProgress) {
      await options.onProgress({
        stage: "GENERATING_RENDICION",
        expectedFiles,
        generatedFiles: 0,
      });
    }

    const rendicionFile = `liquidacion_${consorcioSlug}_${periodoSlug}_rendicion.pdf`;
    const rendicionPath = path.join(outputBase, rendicionFile);
    const rendicionBuffer = await htmlToPdfBuffer(buildLiquidacionPdfHtml(data));
    await writeFile(rendicionPath, rendicionBuffer);

    archivos.push({
      tipoArchivo: "RENDICION",
      nombreArchivo: rendicionFile,
      rutaArchivo: `${relativeBase}/${rendicionFile}`,
      responsableGroupKey: null,
    });

    if (options?.onProgress) {
      await options.onProgress({
        stage: "GENERATING_BOLETAS",
        expectedFiles,
        generatedFiles: archivos.length,
      });
    }

    for (const group of groups) {
      const groupSlug = slugify(group.label || group.key || "grupo");
      const boletaFile = `liquidacion_${consorcioSlug}_${periodoSlug}_boleta_${groupSlug}.pdf`;
      const boletaPath = path.join(outputBase, boletaFile);

      const boletaHtml = buildBoletaHtml(data, group);
      const boletaBuffer = await htmlToPdfBuffer(boletaHtml);
      await writeFile(boletaPath, boletaBuffer);

      archivos.push({
        tipoArchivo: "BOLETA_RESPONSABLE",
        nombreArchivo: boletaFile,
        rutaArchivo: `${relativeBase}/${boletaFile}`,
        responsableGroupKey: group.key,
      });

      if (options?.onProgress) {
        await options.onProgress({
          stage: "GENERATING_BOLETAS",
          expectedFiles,
          generatedFiles: archivos.length,
        });
      }
    }

    return archivos;
  } catch (error) {
    await rm(outputBase, { recursive: true, force: true });
    throw error;
  }
}
