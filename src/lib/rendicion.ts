import { createHash } from "node:crypto";

import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";

import { simularCierreEjercicio, type SimulacionCierre } from "./cierre-simulacion";
import { getAdministradorVigente } from "./consorcio-administradores";
import { launchPdfBrowser } from "./pdf-browser";
import { descifrarPdf } from "./pdf-descifrado";
import { prisma } from "./prisma";
import { buildLibroAdministracionHtml } from "./libro-administracion-html";
import { buildRendicionPdfHtml, type AnexoIndice, type DatosRendicion } from "./rendicion-pdf-html";

type Browser = Awaited<ReturnType<typeof launchPdfBrowser>>;

/** Archivo de un comprobante a anexar (uno por contenido distinto). */
export type ArchivoAnexo = AnexoIndice & { mimeType: string; contenido: Buffer };

type OpcionesRendicion = {
  /** Simulación ya calculada (la confirmación la reutiliza para no recalcular). */
  simulacion?: NonNullable<SimulacionCierre>;
  version?: DatosRendicion["version"];
};

/** Junta los datos de la rendición de un ejercicio. Solo lectura. */
export async function obtenerDatosRendicion(
  ejercicioId: number,
  consorcioId: number,
  opciones: OpcionesRendicion = {},
): Promise<{ datos: DatosRendicion; archivos: ArchivoAnexo[] } | null> {
  const [simulacion, ejercicio, consorcio] = await Promise.all([
    opciones.simulacion ?? simularCierreEjercicio(ejercicioId, consorcioId),
    prisma.ejercicio.findFirst({
      where: { id: ejercicioId, consorcioId },
      select: { vencimientoRendicion: true, notasRendicion: true },
    }),
    prisma.consorcio.findUnique({
      where: { id: consorcioId },
      select: {
        nombre: true,
        tituloLegal: true,
        direccion: true,
        ciudad: true,
        provincia: true,
        cuit: true,
        administradores: {
          select: {
            id: true,
            desde: true,
            hasta: true,
            firmaContenido: true,
            firmaMimeType: true,
            firmaAclaracion: true,
            firmaRol: true,
            persona: { select: { nombre: true, apellido: true } },
          },
        },
      },
    }),
  ]);

  if (!simulacion || !ejercicio || !consorcio) return null;

  const archivos = await prepararAnexoComprobantes(simulacion);

  // Firma quien presenta la rendición: el administrador vigente al emitirla.
  const admin = getAdministradorVigente(consorcio.administradores);

  return {
    archivos,
    datos: {
      simulacion,
      consorcio,
      administrador: admin
        ? {
            nombre: `${admin.persona.nombre} ${admin.persona.apellido}`.trim(),
            firmaDataUri:
              admin.firmaContenido && admin.firmaMimeType?.startsWith("image/")
                ? `data:${admin.firmaMimeType};base64,${Buffer.from(admin.firmaContenido).toString("base64")}`
                : null,
            firmaAclaracion: admin.firmaAclaracion,
            firmaRol: admin.firmaRol,
          }
        : null,
      vencimientoRendicion: ejercicio.vencimientoRendicion,
      emitidaAt: opciones.version?.confirmadoAt ?? new Date(),
      notasAdministrador: ejercicio.notasRendicion,
      version: opciones.version ?? null,
      anexo: archivos.map(({ codigo, gastoIds, nombre, incorporado }) => ({ codigo, gastoIds, nombre, incorporado })),
    },
  };
}

/**
 * Comprobantes de los gastos del ejercicio, en el orden del detalle de gastos.
 * Un mismo archivo (mismo contenido) cargado en varios gastos —por ejemplo, una
 * factura pagada en dos cuotas— se anexa una sola vez, con todos sus gastos.
 */
export async function prepararAnexoComprobantes(simulacion: NonNullable<SimulacionCierre>): Promise<ArchivoAnexo[]> {
  const ids = simulacion.gastosDetalle.filter((g) => g.comprobante).map((g) => g.id);
  if (ids.length === 0) return [];

  const gastos = await prisma.gasto.findMany({
    where: { id: { in: ids }, comprobanteContenido: { not: null } },
    select: { id: true, comprobanteContenido: true, comprobanteMimeType: true, comprobanteNombreOriginal: true },
  });
  const porId = new Map(gastos.map((g) => [g.id, g]));

  const porHuella = new Map<string, ArchivoAnexo>();
  const archivos: ArchivoAnexo[] = [];
  for (const id of ids) {
    const gasto = porId.get(id);
    if (!gasto?.comprobanteContenido) continue; // registros viejos con archivo en disco: no se anexan
    const contenido = Buffer.from(gasto.comprobanteContenido);
    const huella = createHash("sha256").update(contenido).digest("hex");
    const existente = porHuella.get(huella);
    if (existente) {
      existente.gastoIds.push(id);
      continue;
    }
    const mimeType = gasto.comprobanteMimeType ?? "application/octet-stream";
    const preparado = await prepararArchivo(mimeType, contenido);
    const archivo: ArchivoAnexo = {
      codigo: `A${archivos.length + 1}`,
      gastoIds: [id],
      nombre: gasto.comprobanteNombreOriginal ?? `comprobante-gasto-${id}`,
      incorporado: preparado !== null,
      mimeType,
      contenido: preparado ?? contenido,
    };
    porHuella.set(huella, archivo);
    archivos.push(archivo);
  }
  return archivos;
}

/**
 * Contenido listo para anexar, o null si no se puede incorporar. Los PDF
 * protegidos con contraseña de propietario (p. ej. facturas de ARCA) se descifran.
 */
async function prepararArchivo(mimeType: string, contenido: Buffer): Promise<Buffer | null> {
  if (mimeType === "application/pdf") {
    try {
      const descifrado = await descifrarPdf(contenido);
      if (!descifrado) return null;
      const doc = await PDFDocument.load(descifrado);
      return doc.getPageCount() > 0 ? Buffer.from(descifrado) : null;
    } catch {
      return null;
    }
  }
  return ["image/jpeg", "image/png", "image/webp"].includes(mimeType) ? contenido : null;
}

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 28;
const MARGEN_ENCABEZADO = 22;
/** Franja superior de cada hoja del anexo reservada al encabezado (pt). */
const ALTO_ENCABEZADO = 46;

/**
 * Agrega los comprobantes al final de la rendición. Cada hoja del anexo lleva
 * un encabezado con el código, los gastos que respalda y la hoja.
 * - PDF: las páginas se copian tal cual (sin decodificar su contenido, que
 *   puede usar compresiones que pdf-lib no lee) y su contenido se reduce para
 *   dejar arriba la franja del encabezado.
 * - Imágenes: una hoja A4 por imagen, reducida para entrar debajo del encabezado.
 */
async function anexarComprobantes(
  rendicionPdf: Uint8Array,
  archivos: ArchivoAnexo[],
  titulo: string,
  browser: Browser,
) {
  const salida = await PDFDocument.load(rendicionPdf);
  const fuente = await salida.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await salida.embedFont(StandardFonts.HelveticaBold);

  const encabezado = (pagina: PDFPage, archivo: ArchivoAnexo, hoja: number, hojas: number) => {
    const { width, height } = pagina.getSize();
    const gastos = `${archivo.gastoIds.length === 1 ? "Gasto" : "Gastos"} N.º ${archivo.gastoIds.join(", ")}`;
    const yTexto = height - MARGEN_ENCABEZADO - 6;
    pagina.drawRectangle({ x: 0, y: height - ALTO_ENCABEZADO, width, height: ALTO_ENCABEZADO, color: rgb(1, 1, 1) });
    pagina.drawText(`Anexo ${archivo.codigo}`, { x: MARGEN_ENCABEZADO, y: yTexto, size: 10, font: fuenteNegrita });
    pagina.drawText(sanearTexto(`${gastos} · ${archivo.nombre} · hoja ${hoja} de ${hojas}`).slice(0, 110), {
      x: MARGEN_ENCABEZADO + 62,
      y: yTexto,
      size: 8.5,
      font: fuente,
      color: rgb(0.2, 0.25, 0.33),
    });
    pagina.drawText(sanearTexto(titulo).slice(0, 120), {
      x: MARGEN_ENCABEZADO,
      y: yTexto - 12,
      size: 7.5,
      font: fuente,
      color: rgb(0.4, 0.45, 0.53),
    });
    pagina.drawLine({
      start: { x: MARGEN_ENCABEZADO, y: height - ALTO_ENCABEZADO + 1 },
      end: { x: width - MARGEN_ENCABEZADO, y: height - ALTO_ENCABEZADO + 1 },
      thickness: 0.6,
      color: rgb(0.6, 0.65, 0.72),
    });
  };

  for (const archivo of archivos) {
    if (!archivo.incorporado) continue;

    try {
      if (archivo.mimeType === "application/pdf") {
        const origen = await PDFDocument.load(archivo.contenido);
        const paginas = await salida.copyPages(origen, origen.getPageIndices());
        paginas.forEach((pagina, indice) => {
          salida.addPage(pagina);
          const { width, height } = pagina.getSize();
          const factor = (height - ALTO_ENCABEZADO - 4) / height;
          // Reduce el contenido y lo centra en el ancho; arriba queda la franja del encabezado.
          pagina.scaleContent(factor, factor);
          pagina.translateContent((width * (1 - factor)) / 2, 0);
          encabezado(pagina, archivo, indice + 1, paginas.length);
        });
        continue;
      }

      const imagen: PDFImage =
        archivo.mimeType === "image/jpeg"
          ? await salida.embedJpg(archivo.contenido)
          : archivo.mimeType === "image/png"
            ? await salida.embedPng(archivo.contenido)
            : await salida.embedPng(await webpAPng(archivo.contenido, browser));
      const pagina = salida.addPage([A4.ancho, A4.alto]);
      encabezado(pagina, archivo, 1, 1);
      const anchoUtil = A4.ancho - 2 * MARGEN;
      const altoUtil = A4.alto - MARGEN - ALTO_ENCABEZADO - 8;
      const escala = Math.min(anchoUtil / imagen.width, altoUtil / imagen.height, 1);
      const ancho = imagen.width * escala;
      const alto = imagen.height * escala;
      pagina.drawImage(imagen, {
        x: MARGEN + (anchoUtil - ancho) / 2,
        y: MARGEN + altoUtil - alto,
        width: ancho,
        height: alto,
      });
    } catch {
      archivo.incorporado = false;
    }
  }

  return Buffer.from(await salida.save());
}

/** Las fuentes estándar de PDF usan WinAnsi: se reemplazan los caracteres que no tienen. */
function sanearTexto(texto: string) {
  return Array.from(texto)
    .map((c) => (c.charCodeAt(0) <= 0xff || "—–‘’“”•…€".includes(c) ? c : "?"))
    .join("");
}

async function webpAPng(contenido: Buffer, browser: Browser) {
  const page = await browser.newPage();
  try {
    await page.setContent(
      `<html><body style="margin:0"><img id="c" src="data:image/webp;base64,${contenido.toString("base64")}" /></body></html>`,
      { waitUntil: "load" },
    );
    const img = await page.$("#c");
    if (!img) throw new Error("webp_invalido");
    return Buffer.from(await img.screenshot({ type: "png" }));
  } finally {
    await page.close();
  }
}

/** Rendición en PDF con el anexo de comprobantes al final. */
export async function generarRendicionPdf(datos: DatosRendicion, archivos: ArchivoAnexo[] = []) {
  const titulo = `${datos.consorcio.nombre} · Rendición de cuentas · Ejercicio N.º ${datos.simulacion.ejercicio.numero}`;
  const pie = titulo.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(buildRendicionPdfHtml(datos), { waitUntil: "load" });
    const rendicion = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#64748b;padding:0 14mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>${pie}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
    });
    if (archivos.length === 0) return Buffer.from(rendicion);
    return await anexarComprobantes(rendicion, archivos, titulo, browser);
  } finally {
    await browser.close();
  }
}

/** Hoja de una página para pegar en el Libro de Administración (A4, sin pie). */
export async function generarHojaLibroAdministracionPdf(datos: DatosRendicion) {
  const html = buildLibroAdministracionHtml(datos);
  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, pageRanges: "1" }));
  } finally {
    await browser.close();
  }
}
