// Prueba en modo lectura de la rendición con anexo de comprobantes y de la
// huella de la simulación. No escribe en la base: genera los PDF en la carpeta
// indicada. Uso:
//   npx tsx scripts/test-rendicion-anexo.ts <consorcioId> <AAAA-MM-DD inicio> <AAAA-MM-DD fin> <carpeta salida>
import "dotenv/config";

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { PDFDocument } from "pdf-lib";

import { huellaSimulacion } from "../src/lib/cierre-confirmacion";
import { simularCierrePeriodo } from "../src/lib/cierre-simulacion";
import { parseFechaCalendario } from "../src/lib/ejercicios";
import { prisma } from "../src/lib/prisma";
import { generarHojaLibroAdministracionPdf, generarRendicionPdf, prepararAnexoComprobantes } from "../src/lib/rendicion";

async function main() {
  const [consorcioId, inicio, fin, salida] = process.argv.slice(2);
  const fechaInicio = parseFechaCalendario(inicio ?? "");
  const fechaFin = parseFechaCalendario(fin ?? "");
  if (!consorcioId || !fechaInicio || !fechaFin || !salida) throw new Error("Uso: <consorcioId> <inicio> <fin> <carpeta>");

  const ejercicio = { id: -1, numero: 1, fechaInicio, fechaFin, aperturaEstado: "CERO_CONFIRMADO" };
  const s1 = await simularCierrePeriodo(ejercicio, Number(consorcioId));
  const s2 = await simularCierrePeriodo(ejercicio, Number(consorcioId));
  const h1 = huellaSimulacion(s1, "Nota de prueba.");
  const h2 = huellaSimulacion(s2, "Nota de prueba.");
  console.log("Huella estable entre dos cálculos:", h1 === h2, h1.slice(0, 16));
  console.log("Huella cambia con las notas:", huellaSimulacion(s1, "Otra nota.") !== h1);

  const archivos = await prepararAnexoComprobantes(s1);
  for (const a of archivos) {
    console.log(`${a.codigo}: gastos ${a.gastoIds.join(", ")} · ${a.mimeType} · ${a.nombre} · incorporable=${a.incorporado}`);
  }

  const consorcio = await prisma.consorcio.findUniqueOrThrow({
    where: { id: Number(consorcioId) },
    select: { nombre: true, tituloLegal: true, direccion: true, ciudad: true, provincia: true, cuit: true },
  });
  const datos = {
    simulacion: s1,
    consorcio,
    administrador: { nombre: "Administrador de prueba", firmaDataUri: null, firmaAclaracion: null, firmaRol: null },
    vencimientoRendicion: new Date(fechaFin.getTime() + 60 * 86400000),
    emitidaAt: new Date(),
    notasAdministrador: "Primer párrafo de la nota del administrador.\n\nSegundo párrafo,\ncon un salto de línea.",
    version: { numero: 1, confirmadoAt: new Date(), confirmadoPor: "Prueba", huella: h1 },
    anexo: archivos.map(({ codigo, gastoIds, nombre, incorporado }) => ({ codigo, gastoIds, nombre, incorporado })),
  };

  const sinAnexo = await generarRendicionPdf(datos, []);
  const conAnexo = await generarRendicionPdf(datos, archivos);
  const hoja = await generarHojaLibroAdministracionPdf(datos);
  writeFileSync(join(salida, "rendicion-con-anexo.pdf"), conAnexo);
  writeFileSync(join(salida, "hoja-libro.pdf"), hoja);

  const paginas = async (b: Buffer) => (await PDFDocument.load(b)).getPageCount();
  console.log("Páginas rendición:", await paginas(sinAnexo), "· con anexo:", await paginas(conAnexo), "· hoja:", await paginas(hoja));
  console.log("Tamaño con anexo (KB):", Math.round(conAnexo.length / 1024));
}

main().finally(() => prisma.$disconnect());
