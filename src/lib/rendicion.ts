import { simularCierreEjercicio } from "./cierre-simulacion";
import { getAdministradorVigente } from "./consorcio-administradores";
import { launchPdfBrowser } from "./pdf-browser";
import { prisma } from "./prisma";
import { buildRendicionPdfHtml, type DatosRendicion } from "./rendicion-pdf-html";

/** Junta los datos de la rendición de un ejercicio. Solo lectura. */
export async function obtenerDatosRendicion(ejercicioId: number, consorcioId: number): Promise<DatosRendicion | null> {
  const [simulacion, ejercicio, consorcio] = await Promise.all([
    simularCierreEjercicio(ejercicioId, consorcioId),
    prisma.ejercicio.findFirst({ where: { id: ejercicioId, consorcioId }, select: { vencimientoRendicion: true } }),
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

  // Firma quien presenta la rendición: el administrador vigente al emitirla.
  const admin = getAdministradorVigente(consorcio.administradores);

  return {
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
    emitidaAt: new Date(),
  };
}

export async function generarRendicionPdf(datos: DatosRendicion) {
  const html = buildRendicionPdfHtml(datos);
  const pie = `${datos.consorcio.nombre} · Rendición de cuentas · Ejercicio N.º ${datos.simulacion.ejercicio.numero}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;");

  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#64748b;padding:0 14mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>${pie}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await browser.close();
  }
}
