"use client";

import { useEffect, useMemo, useState } from "react";

import {
  MEDIOS_PAGO_EXPENSA,
  type CuentaBancariaDestino,
  type MedioPagoExpensa,
  formatCuentaBancariaDestino,
  getAcreditacionMessage,
} from "../../../lib/fondos";

type PagoAcreditacionFieldsProps = {
  cuentasBancarias: CuentaBancariaDestino[];
  defaultMedioPago: MedioPagoExpensa;
  defaultCuentaBancariaId?: number | null;
};

export function PagoAcreditacionFields({
  cuentasBancarias,
  defaultMedioPago,
  defaultCuentaBancariaId = null,
}: PagoAcreditacionFieldsProps) {
  const cuentaUnicaId = cuentasBancarias.length === 1 ? cuentasBancarias[0].id : null;
  const [medioPago, setMedioPago] = useState<MedioPagoExpensa>(defaultMedioPago);
  const [cuentaId, setCuentaId] = useState<string>(
    defaultCuentaBancariaId ? String(defaultCuentaBancariaId) : cuentaUnicaId ? String(cuentaUnicaId) : "",
  );

  useEffect(() => {
    if (medioPago === "EFECTIVO") {
      setCuentaId("");
      return;
    }

    if (cuentaUnicaId) {
      setCuentaId(String(cuentaUnicaId));
    }
  }, [cuentaUnicaId, medioPago]);

  const cuentaSeleccionada = useMemo(
    () => cuentasBancarias.find((cuenta) => String(cuenta.id) === cuentaId) ?? null,
    [cuentaId, cuentasBancarias],
  );

  const errorTransferencia =
    medioPago === "TRANSFERENCIA" && cuentasBancarias.length === 0
      ? "No hay cuentas bancarias activas para acreditar una transferencia."
      : medioPago === "TRANSFERENCIA" && cuentasBancarias.length > 1 && !cuentaSeleccionada
        ? "Seleccioná una cuenta bancaria destino para continuar."
        : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="medioPago" className="text-sm font-medium text-slate-700">
          Medio de pago
        </label>
        <select
          id="medioPago"
          name="medioPago"
          value={medioPago}
          onChange={(event) => setMedioPago(event.target.value as MedioPagoExpensa)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
        >
          {MEDIOS_PAGO_EXPENSA.map((medio) => (
            <option key={medio} value={medio}>
              {medio}
            </option>
          ))}
        </select>
      </div>

      {medioPago === "TRANSFERENCIA" && cuentasBancarias.length > 1 ? (
        <div className="space-y-1">
          <label htmlFor="consorcioCuentaBancariaId" className="text-sm font-medium text-slate-700">
            Cuenta bancaria destino
          </label>
          <select
            id="consorcioCuentaBancariaId"
            name="consorcioCuentaBancariaId"
            value={cuentaId}
            onChange={(event) => setCuentaId(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            required
          >
            <option value="">Seleccionar cuenta</option>
            {cuentasBancarias.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {formatCuentaBancariaDestino(cuenta)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {medioPago === "TRANSFERENCIA" && cuentaUnicaId ? (
        <input type="hidden" name="consorcioCuentaBancariaId" value={cuentaUnicaId} />
      ) : null}

      <div
        className={`rounded-lg px-4 py-3 text-sm ${
          errorTransferencia
            ? "border border-red-200 bg-red-50 text-red-700"
            : "border border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {errorTransferencia ??
          getAcreditacionMessage({
            medioPago,
            cuentaBancaria: medioPago === "TRANSFERENCIA" ? cuentaSeleccionada ?? cuentasBancarias[0] ?? null : null,
          })}
      </div>
    </div>
  );
}
