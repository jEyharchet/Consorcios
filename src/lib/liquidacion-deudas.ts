export type LiquidacionTasa = {
  fechaVencimiento: Date;
  tasaInteresMensual: number | null;
};

export type CriterioDeuda = "TOTAL" | "CAPITAL" | "INTERES" | "PARCIAL";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function addOneMonth(base: Date): Date {
  const next = new Date(base);
  const day = next.getDate();
  next.setMonth(next.getMonth() + 1);

  // JS ajusta automaticamente cuando el dia no existe en el nuevo mes.
  // Si eso pasa, fijamos el ultimo dia de ese mes para conservar tramos mensuales coherentes.
  if (next.getDate() < day) {
    next.setDate(0);
  }

  return next;
}

function diffDays(from: Date, to: Date): number {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / ONE_DAY_MS));
}

export function calcularInteresCapitalizadoPorTasas(params: {
  capital: number;
  fechaVencimientoDeuda: Date;
  fechaCalculo: Date;
  tasasHistoricas: LiquidacionTasa[];
}): { interes: number; saldoFinal: number } {
  const { capital, fechaVencimientoDeuda, fechaCalculo, tasasHistoricas } = params;

  if (capital <= 0) {
    return { interes: 0, saldoFinal: 0 };
  }

  if (fechaCalculo <= fechaVencimientoDeuda) {
    return { interes: 0, saldoFinal: capital };
  }

  const eventos = tasasHistoricas
    .filter((t) => t.fechaVencimiento >= fechaVencimientoDeuda && t.fechaVencimiento <= fechaCalculo)
    .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());

  let saldo = capital;
  let ultimaFechaAplicada: Date | null = null;
  let ultimaTasa: number | null = null;

  for (const evento of eventos) {
    const tasa = evento.tasaInteresMensual ?? 0;

    if (tasa > 0) {
      saldo = saldo * (1 + tasa / 100);
    }

    ultimaFechaAplicada = evento.fechaVencimiento;
    ultimaTasa = tasa;
  }

  // Si la fecha de calculo no coincide con un cierre mensual completo,
  // se prorratea por dias usando la ultima tasa mensual aplicada.
  if (ultimaFechaAplicada && ultimaTasa && ultimaTasa > 0 && fechaCalculo > ultimaFechaAplicada) {
    const siguienteVencimiento = addOneMonth(ultimaFechaAplicada);
    const diasTramo = Math.max(1, diffDays(ultimaFechaAplicada, siguienteVencimiento));
    const diasTranscurridos = Math.min(diffDays(ultimaFechaAplicada, fechaCalculo), diasTramo);

    if (diasTranscurridos > 0 && diasTranscurridos < diasTramo) {
      const tasaProrrateada = (ultimaTasa / 100) * (diasTranscurridos / diasTramo);
      saldo = saldo * (1 + tasaProrrateada);
    }
  }

  const interes = Math.max(0, saldo - capital);

  return {
    interes,
    saldoFinal: saldo,
  };
}

export function calcularImportePorCriterio(params: {
  capital: number;
  interes: number;
  criterio: CriterioDeuda;
  parcial?: number | null;
}): number | null {
  const { capital, interes, criterio, parcial } = params;
  const total = capital + interes;

  if (criterio === "TOTAL") {
    return total;
  }

  if (criterio === "CAPITAL") {
    return capital;
  }

  if (criterio === "INTERES") {
    return interes;
  }

  if (criterio === "PARCIAL") {
    if (parcial === null || parcial === undefined || Number.isNaN(parcial)) {
      return null;
    }

    if (parcial <= 0 || parcial > total) {
      return null;
    }

    return parcial;
  }

  return null;
}

