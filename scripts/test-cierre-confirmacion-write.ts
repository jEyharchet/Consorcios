// Prueba de ESCRITURA del circuito de cierre: crea ejercicios temporales,
// confirma, verifica el bloqueo, reabre, vuelve a confirmar y borra todo lo
// creado al terminar. Usar solo contra el branch Neon `dev`. Opcionalmente
// envía la rendición de prueba a la administración (email real). Uso:
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/test-cierre-confirmacion-write.ts <consorcioId> [--email]
import "dotenv/config";

import { leerAperturaDetalle } from "../src/lib/apertura";
import {
  confirmarCierreEjercicio,
  guardarNotasRendicion,
  huellaSimulacion,
  reabrirEjercicio,
} from "../src/lib/cierre-confirmacion";
import { simularCierreEjercicio } from "../src/lib/cierre-simulacion";
import { CobranzaError, registrarPagoExpensa } from "../src/lib/cobranzas-expensas";
import { ejercicioCerradoPorPeriodo } from "../src/lib/ejercicio-bloqueo";
import { parseFechaCalendario } from "../src/lib/ejercicios";
import { crearEjercicio, eliminarEjercicio, registrarApertura } from "../src/lib/ejercicios-data";
import { PagoGastoError, registrarPagoGasto } from "../src/lib/pagos-gastos";
import { prisma } from "../src/lib/prisma";

let fallas = 0;
function verificar(condicion: boolean, texto: string) {
  console.log(`${condicion ? "OK   " : "FALLA"} ${texto}`);
  if (!condicion) fallas++;
}

const d = (s: string) => parseFechaCalendario(s)!;

async function main() {
  const consorcioId = Number(process.argv[2]);
  const conEmail = process.argv.includes("--email");
  if (!consorcioId) throw new Error("Uso: <consorcioId> [--email]");
  if (!process.env.DATABASE_URL?.includes("ep-empty-truth")) throw new Error("Solo contra el branch dev.");
  if (await prisma.ejercicio.count({ where: { consorcioId } })) {
    throw new Error("El consorcio ya tiene ejercicios en esta base: la prueba no los toca.");
  }

  const user = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" }, orderBy: { createdAt: "asc" } });
  const datos = (inicio: string, fin: string) => ({
    fechaInicio: d(inicio),
    fechaFin: d(fin),
    vencimientoRendicion: null,
    fundamento: "Prueba automática",
    observaciones: null,
  });

  try {
    const r1 = await crearEjercicio(consorcioId, datos("2025-10-01", "2026-09-30"), user.id);
    if (!r1.ok) throw new Error(r1.errores.join(" "));
    await registrarApertura(consorcioId, r1.id, "CERO_CONFIRMADO", "Prueba", user.id);
    const r2 = await crearEjercicio(consorcioId, datos("2026-10-01", "2027-09-30"), user.id);
    if (!r2.ok) throw new Error(r2.errores.join(" "));
    const ej1 = r1.id;
    const ej2 = r2.id;

    await guardarNotasRendicion(ej1, consorcioId, "Nota de prueba.\n\nSegundo párrafo.");
    const s = (await simularCierreEjercicio(ej1, consorcioId))!;
    const huella = huellaSimulacion(s, "Nota de prueba.\n\nSegundo párrafo.");

    // Rechazos
    const malHuella = await confirmarCierreEjercicio({ ejercicioId: ej1, consorcioId, userId: user.id, huellaRevisada: "x", aceptaObservaciones: true });
    verificar(!malHuella.ok, "huella distinta: no confirma");
    const sinAceptar = await confirmarCierreEjercicio({ ejercicioId: ej1, consorcioId, userId: user.id, huellaRevisada: huella, aceptaObservaciones: false });
    verificar(!sinAceptar.ok, "observaciones a verificar sin aceptar: no confirma");
    verificar((await prisma.ejercicio.findUniqueOrThrow({ where: { id: ej1 } })).estado === "ABIERTO", "tras los rechazos sigue ABIERTO");

    // Confirmación
    const t0 = Date.now();
    const conf = await confirmarCierreEjercicio({ ejercicioId: ej1, consorcioId, userId: user.id, huellaRevisada: huella, aceptaObservaciones: true });
    verificar(conf.ok && conf.version === 1, `confirma versión 1 (${Math.round((Date.now() - t0) / 1000)} s) ${conf.ok ? conf.avisos.join(" / ") : conf.errores.join(" / ")}`);
    const c1 = await prisma.cierreEjercicio.findFirstOrThrow({ where: { ejercicioId: ej1, version: 1 } });
    verificar(c1.estado === "VIGENTE" && c1.rendicionPdf.length > 10000 && c1.hojaLibroPdf.length > 5000, `PDF guardados (rendición ${Math.round(c1.rendicionPdf.length / 1024)} KB, hoja ${Math.round(c1.hojaLibroPdf.length / 1024)} KB, ${c1.comprobantesAnexados} comprobantes)`);
    verificar((await prisma.ejercicio.findUniqueOrThrow({ where: { id: ej1 } })).estado === "CERRADO", "ejercicio 1 CERRADO");
    const e2 = await prisma.ejercicio.findUniqueOrThrow({ where: { id: ej2 } });
    const ap = leerAperturaDetalle(e2.aperturaDetalle);
    verificar(e2.aperturaEstado === "INFORMADA" && ap?.origen?.version === 1, `apertura del 2 informada (saldo neto ${ap?.saldoNeto}, fondos ${ap?.fondos.map((f) => `${f.nombre}=${f.saldo}`).join(", ")})`);
    const doble = await confirmarCierreEjercicio({ ejercicioId: ej1, consorcioId, userId: user.id, huellaRevisada: huella, aceptaObservaciones: true });
    verificar(!doble.ok, "segunda confirmación rechazada");

    // Bloqueo
    verificar(Boolean(await ejercicioCerradoPorPeriodo(consorcioId, "2026-05")), "período 2026-05 bloqueado");
    verificar(!(await ejercicioCerradoPorPeriodo(consorcioId, "2026-10")), "período 2026-10 libre");
    verificar(!(await guardarNotasRendicion(ej1, consorcioId, "otra")), "notas no editables con el ejercicio cerrado");

    const gastoPagado = await prisma.gasto.findFirst({ where: { consorcioId, periodo: "2026-05", pagosGasto: { some: {} } }, select: { id: true } });
    if (gastoPagado) {
      const codigo = await registrarPagoGasto({ gastoId: gastoPagado.id, fechaPago: d("2026-09-15"), monto: 1, medioPago: "EFECTIVO" })
        .then(() => "sin error")
        .catch((e) => (e instanceof PagoGastoError ? e.code : String(e)));
      verificar(codigo === "ejercicio_cerrado", `pago de gasto con fecha 15/09/2026 rechazado (${codigo})`);
    }
    const expensaPagada = await prisma.expensa.findFirst({ where: { unidad: { consorcioId }, estado: "PAGADA" }, select: { id: true } });
    if (expensaPagada) {
      const codigo = await registrarPagoExpensa({ expensaId: expensaPagada.id, fechaPago: d("2026-09-30"), monto: 1, medioPago: "EFECTIVO", registradoPorUserId: user.id })
        .then(() => "sin error")
        .catch((e) => (e instanceof CobranzaError ? e.code : String(e)));
      verificar(codigo === "ejercicio_cerrado" || codigo === "fecha_anterior_a_pago_existente", `cobro con fecha 30/09/2026 rechazado (${codigo})`);
    }

    // Simulación del ejercicio 2 con la apertura tomada del cierre
    const s2 = (await simularCierreEjercicio(ej2, consorcioId))!;
    verificar(s2.fondosInicial === ap?.fondos.reduce((a, f) => a + f.saldo, 0), `ejercicio 2 parte de caja y bancos ${s2.fondosInicial}`);
    verificar(!s2.inconsistencias.some((i) => i.codigo === "APERTURA"), "ejercicio 2 sin observación de apertura");

    if (conEmail) {
      const { enviarRendicionEjercicio } = await import("../src/lib/administracion");
      const resumen = await enviarRendicionEjercicio({ ejercicioId: ej1, consorcioId, prueba: true, mensaje: "Envío de prueba (dev)." });
      verificar(resumen.enviados > 0, `envío de prueba a la administración: ${JSON.stringify(resumen)}`);
      verificar((await prisma.cierreEjercicio.findUniqueOrThrow({ where: { id: c1.id } })).presentadaAt === null, "la prueba no registra presentación");
    }

    // Reapertura
    const corto = await reabrirEjercicio({ ejercicioId: ej1, consorcioId, userId: user.id, motivo: "corto" });
    verificar(!corto.ok, "reapertura sin motivo suficiente rechazada");
    const re = await reabrirEjercicio({ ejercicioId: ej1, consorcioId, userId: user.id, motivo: "Prueba de reapertura automática" });
    verificar(re.ok, `reabre (${re.ok ? re.avisos.join(" / ") : re.errores.join(" / ")})`);
    verificar((await prisma.cierreEjercicio.findUniqueOrThrow({ where: { id: c1.id } })).estado === "REABIERTO", "versión 1 queda REABIERTA");
    verificar((await prisma.ejercicio.findUniqueOrThrow({ where: { id: ej2 } })).aperturaEstado === "PENDIENTE", "apertura del 2 vuelve a PENDIENTE");
    verificar(!(await ejercicioCerradoPorPeriodo(consorcioId, "2026-05")), "período 2026-05 editable otra vez");

    // Segunda confirmación
    const sB = (await simularCierreEjercicio(ej1, consorcioId))!;
    const conf2 = await confirmarCierreEjercicio({ ejercicioId: ej1, consorcioId, userId: user.id, huellaRevisada: huellaSimulacion(sB, "Nota de prueba.\n\nSegundo párrafo."), aceptaObservaciones: true });
    verificar(conf2.ok && conf2.version === 2, "confirma versión 2");
    verificar(leerAperturaDetalle((await prisma.ejercicio.findUniqueOrThrow({ where: { id: ej2 } })).aperturaDetalle)?.origen?.version === 2, "apertura del 2 tomada de la versión 2");

    // Ejercicio nuevo creado después de uno cerrado: apertura automática
    const del = await eliminarEjercicio(consorcioId, ej2);
    verificar(del.ok, "ejercicio 2 eliminado (abierto, sin cierres)");
    const r2b = await crearEjercicio(consorcioId, datos("2026-10-01", "2027-09-30"), user.id);
    const e2b = r2b.ok ? await prisma.ejercicio.findUniqueOrThrow({ where: { id: r2b.id } }) : null;
    verificar(e2b?.aperturaEstado === "INFORMADA" && leerAperturaDetalle(e2b.aperturaDetalle)?.origen?.version === 2, "ejercicio nuevo toma la apertura del cierre vigente");
  } finally {
    const ejercicios = await prisma.ejercicio.findMany({ where: { consorcioId }, select: { id: true } });
    const ids = ejercicios.map((e) => e.id);
    const cierres = await prisma.cierreEjercicio.findMany({ where: { ejercicioId: { in: ids } }, select: { id: true } });
    await prisma.envioEmail.deleteMany({ where: { cierreEjercicioId: { in: cierres.map((c) => c.id) } } });
    await prisma.cierreEjercicio.deleteMany({ where: { ejercicioId: { in: ids } } });
    await prisma.ejercicio.deleteMany({ where: { id: { in: ids } } });
    console.log(`Limpieza: ${ids.length} ejercicios y ${cierres.length} cierres borrados.`);
    console.log(fallas === 0 ? "Todo OK" : `${fallas} fallas`);
  }
}

main().finally(() => prisma.$disconnect());
