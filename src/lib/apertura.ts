// Detalle de los saldos de apertura de un ejercicio (Ejercicio.aperturaDetalle).
//
// Se genera al confirmar el cierre del ejercicio anterior: los saldos de caja y
// bancos, las expensas pendientes de cobro y los gastos pendientes de pago al
// cierre pasan a ser la apertura del siguiente. No genera movimientos, expensas
// ni gastos: esos registros ya existen y siguen su curso (se cobran o pagan con
// fecha del ejercicio nuevo). La apertura solo le dice a la simulación desde
// qué saldos partir.

import type { SimulacionCierre } from "./cierre-simulacion";

export type AperturaDetalle = {
  origen: { ejercicioId: number; numero: number; cierreId: number; version: number } | null;
  fondos: Array<{ clave: string; nombre: string; saldo: number }>;
  creditos: Array<{ unidad: string; capital: number }>;
  creditosTotal: number;
  deudas: Array<{ id: number; periodo: string; concepto: string; proveedor: string | null; pendiente: number }>;
  deudasTotal: number;
  /** Caja y bancos + créditos − deudas. */
  saldoNeto: number;
};

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function esNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

/** Valida el JSON guardado; devuelve null si no tiene la forma esperada. */
export function leerAperturaDetalle(valor: unknown): AperturaDetalle | null {
  if (!valor || typeof valor !== "object") return null;
  const d = valor as Partial<AperturaDetalle>;
  if (!Array.isArray(d.fondos) || !d.fondos.every((f) => f && typeof f.clave === "string" && esNumero(f.saldo))) {
    return null;
  }
  if (!esNumero(d.creditosTotal) || !esNumero(d.deudasTotal) || !esNumero(d.saldoNeto)) return null;
  return {
    origen: d.origen ?? null,
    fondos: d.fondos,
    creditos: Array.isArray(d.creditos) ? d.creditos : [],
    creditosTotal: d.creditosTotal,
    deudas: Array.isArray(d.deudas) ? d.deudas : [],
    deudasTotal: d.deudasTotal,
    saldoNeto: d.saldoNeto,
  };
}

/** Apertura del ejercicio siguiente a partir de la simulación confirmada del cierre. */
export function aperturaDesdeCierre(
  simulacion: NonNullable<SimulacionCierre>,
  origen: NonNullable<AperturaDetalle["origen"]>,
): AperturaDetalle | null {
  if (simulacion.fondosFinal === null) return null;
  const fondos = simulacion.fondos.map((f) => ({ clave: f.clave, nombre: f.nombre, saldo: f.finalCalculado ?? 0 }));
  return {
    origen,
    fondos,
    creditos: simulacion.creditos.map((c) => ({ unidad: c.unidad, capital: c.capital })),
    creditosTotal: simulacion.creditosTotal,
    deudas: simulacion.deudasProveedores.map((d) => ({
      id: d.id,
      periodo: d.periodo,
      concepto: d.concepto,
      proveedor: d.proveedor,
      pendiente: d.pendiente,
    })),
    deudasTotal: simulacion.deudaProveedoresTotal,
    saldoNeto: redondear(simulacion.fondosFinal + simulacion.creditosTotal - simulacion.deudaProveedoresTotal),
  };
}

export function textoOrigenApertura(detalle: AperturaDetalle | null) {
  if (!detalle?.origen) return "según el detalle informado";
  return `según el cierre confirmado del ejercicio N.º ${detalle.origen.numero} (versión ${detalle.origen.version})`;
}
