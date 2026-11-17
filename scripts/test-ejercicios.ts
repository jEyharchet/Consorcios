// Prueba manual de las reglas puras de ejercicios (no accede a la base).
// Uso: npx tsx scripts/test-ejercicios.ts
import assert from "node:assert/strict";
import {
  calcularVencimientoRendicion,
  duracionEnDias,
  fechaEnEjercicio,
  formatFechaCalendario,
  parseFechaCalendario,
  rangoConsultaEjercicio,
  sugerirSiguienteEjercicio,
  validarEjercicio,
} from "../src/lib/ejercicios";

const f = (s: string) => {
  const d = parseFechaCalendario(s);
  if (!d) throw new Error(`Fecha inválida: ${s}`);
  return d;
};

// Jara 166, ejercicio N.º 1.
const jara1 = { id: 1, numero: 1, fechaInicio: f("2025-10-01"), fechaFin: f("2026-09-30"), estado: "ABIERTO" };

assert.equal(formatFechaCalendario(calcularVencimientoRendicion(jara1.fechaFin)), "2026-11-29");
assert.equal(duracionEnDias(jara1), 365);
assert.deepEqual(validarEjercicio({ ...jara1, fundamento: "Acta N.º 1, punto 8" }, []), { errores: [], advertencias: [] });

// Fechas cargadas en Vercel (00:00Z) y en local (-03 → 03:00Z) caen en el mismo día.
assert.ok(fechaEnEjercicio(new Date("2026-09-30T00:00:00Z"), jara1));
assert.ok(fechaEnEjercicio(new Date("2026-09-30T03:00:00Z"), jara1));
assert.ok(!fechaEnEjercicio(new Date("2026-10-01T00:00:00Z"), jara1));
assert.ok(!fechaEnEjercicio(new Date("2025-09-30T03:00:00Z"), jara1));
assert.equal(rangoConsultaEjercicio(jara1).lt.toISOString(), "2026-10-01T00:00:00.000Z");

// Sugerencia del siguiente.
const sig = sugerirSiguienteEjercicio(jara1);
assert.equal(formatFechaCalendario(sig.fechaInicio), "2026-10-01");
assert.equal(formatFechaCalendario(sig.fechaFin), "2027-09-30");
assert.equal(formatFechaCalendario(sugerirSiguienteEjercicio({ fechaFin: f("2027-02-28") }).fechaFin), "2028-02-29");
assert.equal(formatFechaCalendario(sugerirSiguienteEjercicio({ fechaFin: f("2023-12-31") }).fechaFin), "2024-12-31");

// Fechas inexistentes.
assert.equal(parseFechaCalendario("2026-02-30"), null);
assert.equal(parseFechaCalendario("30/09/2026"), null);

// Errores.
assert.match(validarEjercicio({ fechaInicio: f("2026-10-01"), fechaFin: f("2026-09-30") }, []).errores[0], /anterior a la fecha de inicio/);
assert.match(
  validarEjercicio({ fechaInicio: f("2026-09-01"), fechaFin: f("2027-08-31") }, [jara1]).errores[0],
  /Se superpone con el ejercicio N\.º 1/,
);
assert.match(validarEjercicio({ fechaInicio: f("2026-11-01"), fechaFin: f("2027-10-31") }, [jara1]).errores[0], /hueco/);
assert.match(
  validarEjercicio({ ...jara1, fechaFin: f("2026-12-31") }, [{ ...jara1, estado: "CERRADO" }]).errores[0],
  /está cerrado/,
);
assert.match(
  validarEjercicio({ ...jara1, vencimientoRendicion: f("2026-09-01") }, []).errores[0],
  /vencimiento de la rendición/,
);

// Ejercicio de transición (cambio de cierre de septiembre a diciembre): válido con advertencia.
const transicion = validarEjercicio({ fechaInicio: f("2026-10-01"), fechaFin: f("2026-12-31") }, [jara1]);
assert.deepEqual(transicion.errores, []);
assert.equal(transicion.advertencias.length, 2);

// Editar el propio ejercicio abierto no choca consigo mismo.
assert.deepEqual(validarEjercicio({ ...jara1, observaciones: "x" } as typeof jara1, [jara1]).errores, []);

console.log("test-ejercicios: OK");
