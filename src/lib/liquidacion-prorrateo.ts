export type ProrrateoBaseUnidad = {
  unidadId: number;
  unidadLabel: string;
  coeficiente: number;
  saldoAnterior: number;
  pagosPeriodo: number;
  intereses: number;
  saldoAFavor: number;
};

export type ProrrateoCalculadoUnidad = ProrrateoBaseUnidad & {
  saldoDeudor: number;
  cargoPeriodoExacto: number;
  totalExacto: number;
  totalRedondeado: number;
  redondeo: number;
  residuoDecimal: number;
};

export function calcularBaseFinanciera(unidades: ProrrateoBaseUnidad[], baseProrrateable: number): ProrrateoCalculadoUnidad[] {
  return unidades.map((unidad) => {
    const saldoDeudor = Math.max(0, unidad.saldoAnterior - unidad.pagosPeriodo);
    const cargoPeriodoExacto = baseProrrateable * unidad.coeficiente;
    const totalExacto = saldoDeudor + unidad.intereses + cargoPeriodoExacto;
    const totalRedondeado = Math.round(totalExacto);

    return {
      ...unidad,
      saldoDeudor,
      cargoPeriodoExacto,
      totalExacto,
      totalRedondeado,
      redondeo: totalRedondeado - totalExacto,
      residuoDecimal: totalExacto - Math.floor(totalExacto),
    };
  });
}

export function aplicarRedondeoAuditable(rows: ProrrateoCalculadoUnidad[]) {
  if (rows.length === 0) {
    return {
      rows,
      expectedRoundedTotal: 0,
      exactTotal: 0,
      roundedTotal: 0,
      diferenciaAjuste: 0,
    };
  }

  const exactTotal = rows.reduce((acc, row) => acc + row.totalExacto, 0);
  const expectedRoundedTotal = Math.round(exactTotal);

  const adjusted = rows.map((row) => ({ ...row }));
  let roundedTotal = adjusted.reduce((acc, row) => acc + row.totalRedondeado, 0);
  let diff = expectedRoundedTotal - roundedTotal;

  if (diff !== 0) {
    const sorted = [...adjusted].sort((a, b) => {
      if (diff > 0) {
        if (b.residuoDecimal !== a.residuoDecimal) return b.residuoDecimal - a.residuoDecimal;
      } else if (a.residuoDecimal !== b.residuoDecimal) {
        return a.residuoDecimal - b.residuoDecimal;
      }

      return a.unidadId - b.unidadId;
    });

    let idx = 0;
    while (diff !== 0 && sorted.length > 0) {
      const row = sorted[idx % sorted.length];
      if (diff > 0) {
        row.totalRedondeado += 1;
        diff -= 1;
      } else if (row.totalRedondeado > 0) {
        row.totalRedondeado -= 1;
        diff += 1;
      } else {
        idx += 1;
        if (idx > sorted.length * 2) {
          break;
        }
        continue;
      }
      idx += 1;
    }
  }

  for (const row of adjusted) {
    row.redondeo = row.totalRedondeado - row.totalExacto;
  }

  roundedTotal = adjusted.reduce((acc, row) => acc + row.totalRedondeado, 0);

  return {
    rows: adjusted,
    expectedRoundedTotal,
    exactTotal,
    roundedTotal,
    diferenciaAjuste: expectedRoundedTotal - rows.reduce((acc, row) => acc + row.totalRedondeado, 0),
  };
}
