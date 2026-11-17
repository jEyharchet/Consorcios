// Corre la simulación del cierre en modo lectura e imprime un resumen.
// No escribe en la base. Uso:
//   npx tsx scripts/test-cierre-simulacion.ts <consorcioId> <AAAA-MM-DD inicio> <AAAA-MM-DD fin> [CERO_CONFIRMADO|PENDIENTE]
import "dotenv/config";

import { simularCierrePeriodo } from "../src/lib/cierre-simulacion";
import { parseFechaCalendario } from "../src/lib/ejercicios";
import { prisma } from "../src/lib/prisma";

async function main() {
  const [consorcioId, inicio, fin, apertura = "CERO_CONFIRMADO"] = process.argv.slice(2);
  const fechaInicio = parseFechaCalendario(inicio ?? "");
  const fechaFin = parseFechaCalendario(fin ?? "");
  if (!consorcioId || !fechaInicio || !fechaFin) throw new Error("Uso: <consorcioId> <inicio> <fin> [apertura]");

  const s = await simularCierrePeriodo(
    { id: -1, numero: 0, fechaInicio, fechaFin, aperturaEstado: apertura },
    Number(consorcioId),
  );

  console.log("Fondos:", s.fondos.map((f) => ({ cuenta: f.nombre, inicial: f.inicial, cobranzas: f.cobranzas, pagos: f.pagos, ajustes: f.ajustes, final: f.finalCalculado, registrado: f.saldoSegunRegistros })));
  console.log("Totales:", s.totales, "fondosFinal:", s.fondosFinal);
  console.log("Por mes:", s.porMes);
  console.log("Gastos devengados:", s.gastosDevengados, "Deuda proveedores:", s.deudaProveedoresTotal, s.deudasProveedores);
  console.log("Emitido:", s.emitidoTotal, "Fondo reserva liquidado:", s.fondoReservaLiquidado, s.liquidaciones.map((l) => `${l.periodo}:${l.emitido}`).join(" "));
  console.log("Créditos:", s.creditosTotal, s.creditos);
  for (const i of s.inconsistencias) {
    console.log(`[${i.gravedad}] ${i.titulo} (${i.items.length})`);
    for (const it of i.items.slice(0, 12)) console.log("   -", it.texto, it.monto ?? "");
  }
}

main().finally(() => prisma.$disconnect());
