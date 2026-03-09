const QR_CUENTA_DNI_DINAMICO = "QR_CUENTA_DNI_DINAMICO" as const;
const TRANSIENT_QR_IMAGE_RENDERER_BASE_URL = "https://api.qrserver.com/v1/create-qr-code/";

type SupportedQrMode = typeof QR_CUENTA_DNI_DINAMICO;

type EmvField = {
  id: string;
  value: string;
};

export type CuentaBancariaQrConfig = {
  qrEnabled?: boolean | null;
  qrMode?: string | null;
  qrPayloadTemplate?: string | null;
  qrLabel?: string | null;
  qrExperimental?: boolean | null;
};

export type PaymentQrData = {
  mode: SupportedQrMode;
  payload: string;
  imageUrl: string;
  label: string;
  experimental: boolean;
};

const DEFAULT_CUENTA_DNI_LABEL = "Pod\u00E9s transferir con Cuenta DNI";
const LEADING_TRAILING_INVISIBLE_CHARS = /^[\s\u00A0\u200B\u200C\u200D\u2060\uFEFF]+|[\s\u00A0\u200B\u200C\u200D\u2060\uFEFF]+$/g;
const EMBEDDED_CONTROL_CHARS = /[\r\n\t\u200B\u200C\u200D\u2060\uFEFF]/g;

export function normalizeQrPayloadTemplateInput(template: string) {
  return template.replace(LEADING_TRAILING_INVISIBLE_CHARS, "").replace(EMBEDDED_CONTROL_CHARS, "").trim();
}

function parseEmvFields(payload: string) {
  const fields: EmvField[] = [];
  let cursor = 0;

  while (cursor < payload.length) {
    const id = payload.slice(cursor, cursor + 2);
    const lengthRaw = payload.slice(cursor + 2, cursor + 4);

    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthRaw)) {
      throw new Error(`Payload QR invalido: estructura TLV incorrecta en offset ${cursor}.`);
    }

    const length = Number(lengthRaw);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;
    const value = payload.slice(valueStart, valueEnd);

    if (value.length !== length) {
      throw new Error(`Payload QR invalido: longitud inconsistente en campo ${id}.`);
    }

    fields.push({ id, value });
    cursor = valueEnd;
  }

  return fields;
}

function serializeEmvFields(fields: EmvField[]) {
  return fields
    .map(({ id, value }) => {
      const length = `${value.length}`.padStart(2, "0");
      return `${id}${length}${value}`;
    })
    .join("");
}

function stripTrailingCrcField(payload: string) {
  if (/6304[0-9A-Fa-f]{4}$/.test(payload)) {
    return payload.slice(0, -8);
  }

  return payload;
}

function upsertField(fields: EmvField[], id: string, value: string) {
  const next = fields.filter((field) => field.id !== "63");
  const existingIndex = next.findIndex((field) => field.id === id);

  if (existingIndex >= 0) {
    next[existingIndex] = { id, value };
    return next;
  }

  const amountAnchorIndex = next.findIndex((field) => field.id === "58");
  if (amountAnchorIndex >= 0) {
    next.splice(amountAnchorIndex, 0, { id, value });
    return next;
  }

  next.push({ id, value });
  return next;
}

function formatAmount(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Monto invalido para QR.");
  }

  return amount.toFixed(2);
}

function validateCuentaDniObservedFields(fields: EmvField[]) {
  const versionField = fields[0];
  if (!versionField || versionField.id !== "00") {
    throw new Error("Payload QR invalido: falta el campo de version EMV.");
  }

  const merchantAccountInfo = fields.find((field) => field.id === "43");
  if (!merchantAccountInfo || !merchantAccountInfo.value.includes("ar.com.cuentadni")) {
    throw new Error("Payload QR invalido: no corresponde a un QR observado de Cuenta DNI.");
  }

  const countryCode = fields.find((field) => field.id === "58");
  if (!countryCode || countryCode.value !== "AR") {
    throw new Error("Payload QR invalido: codigo de pais ausente o invalido.");
  }
}

function parseCuentaDniTemplate(template: string) {
  const normalizedTemplate = normalizeQrPayloadTemplateInput(template);
  if (!normalizedTemplate) {
    throw new Error("Payload QR invalido: vacio.");
  }

  const withoutCrc = stripTrailingCrcField(normalizedTemplate);
  const fields = parseEmvFields(withoutCrc);
  validateCuentaDniObservedFields(fields);
  return fields;
}

// Experimental: este modo se basa en payloads EMV observados de Cuenta DNI.
// No es una integracion oficial; solo inserta el monto y recalcula el CRC final.
export function calculateEmvQrCrc(payloadWithoutCrc: string) {
  let crc = 0xffff;

  for (let i = 0; i < payloadWithoutCrc.length; i += 1) {
    crc ^= payloadWithoutCrc.charCodeAt(i) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Experimental: reconstruye el payload dinamico a partir de un template observado.
// No debe moverse fuera de este modulo para mantener EMV/CRC aislados del render HTML.
export function buildCuentaDniDynamicQrPayload(template: string, amount: number) {
  const baseFields = parseCuentaDniTemplate(template);
  const amountValue = formatAmount(amount);
  const fieldsWithAmount = upsertField(baseFields, "54", amountValue);
  const payloadWithoutCrc = `${serializeEmvFields(fieldsWithAmount.filter((field) => field.id !== "63"))}6304`;
  const crc = calculateEmvQrCrc(payloadWithoutCrc);

  return `${payloadWithoutCrc}${crc}`;
}

export function validateCuentaDniQrTemplate(template: string) {
  parseCuentaDniTemplate(template);
}

// Solucion transitoria: la imagen del QR se renderiza con un servicio externo.
// Cuando exista generacion local, el reemplazo debe ocurrir solo en esta funcion.
export function buildQrImageUrl(payload: string) {
  const params = new URLSearchParams({
    size: "220x220",
    data: payload,
  });

  return `${TRANSIENT_QR_IMAGE_RENDERER_BASE_URL}?${params.toString()}`;
}

export function buildBankAccountPaymentQr(account: CuentaBancariaQrConfig, amount: number): PaymentQrData | null {
  if (!account.qrEnabled) {
    return null;
  }

  if (account.qrMode !== QR_CUENTA_DNI_DINAMICO || !account.qrPayloadTemplate) {
    return null;
  }

  const payload = buildCuentaDniDynamicQrPayload(account.qrPayloadTemplate, amount);

  return {
    mode: QR_CUENTA_DNI_DINAMICO,
    payload,
    imageUrl: buildQrImageUrl(payload),
    label: account.qrLabel?.trim() || DEFAULT_CUENTA_DNI_LABEL,
    experimental: Boolean(account.qrExperimental),
  };
}

export { DEFAULT_CUENTA_DNI_LABEL, QR_CUENTA_DNI_DINAMICO, TRANSIENT_QR_IMAGE_RENDERER_BASE_URL };
