export const MEDIOS_PAGO_EXPENSA = ["TRANSFERENCIA", "EFECTIVO"] as const;

export type MedioPagoExpensa = (typeof MEDIOS_PAGO_EXPENSA)[number];

export type CuentaBancariaDestino = {
  id: number;
  banco: string;
  tipoCuenta: string | null;
  titular: string;
  numeroCuenta: string | null;
  cbu: string;
  alias: string | null;
  saldoActual: number;
};

export function isMedioPagoExpensa(value: string): value is MedioPagoExpensa {
  return MEDIOS_PAGO_EXPENSA.includes(value as MedioPagoExpensa);
}

export function formatCuentaBancariaDestino(cuenta: CuentaBancariaDestino) {
  const partes = [cuenta.banco];

  if (cuenta.tipoCuenta) {
    partes.push(cuenta.tipoCuenta);
  }

  if (cuenta.numeroCuenta) {
    partes.push(`N. ${cuenta.numeroCuenta}`);
  }

  if (cuenta.alias) {
    partes.push(`Alias ${cuenta.alias}`);
  } else {
    partes.push(`CBU ${cuenta.cbu}`);
  }

  return partes.join(" - ");
}

export function getAcreditacionMessage(params: {
  medioPago: MedioPagoExpensa;
  cuentaBancaria?: CuentaBancariaDestino | null;
}) {
  if (params.medioPago === "EFECTIVO") {
    return "El importe se acreditará en caja";
  }

  if (!params.cuentaBancaria) {
    return "El importe se acreditará en la cuenta bancaria seleccionada";
  }

  return `El importe se acreditará en ${formatCuentaBancariaDestino(params.cuentaBancaria)}`;
}
