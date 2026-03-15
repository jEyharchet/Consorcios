export const EMAIL_ESTADO = {
  PENDIENTE: "PENDIENTE",
  ENVIADO: "ENVIADO",
  ERROR: "ERROR",
  SIN_DESTINATARIO: "SIN_DESTINATARIO",
} as const;

export type EmailSummary = {
  total: number;
  enviados: number;
  fallidos: number;
  sinDestinatario: number;
};

export function buildEmailSummary(items: Array<{ estado: string }>): EmailSummary {
  return {
    total: items.length,
    enviados: items.filter((item) => item.estado === EMAIL_ESTADO.ENVIADO).length,
    fallidos: items.filter((item) => item.estado === EMAIL_ESTADO.ERROR).length,
    sinDestinatario: items.filter((item) => item.estado === EMAIL_ESTADO.SIN_DESTINATARIO).length,
  };
}

export function formatEmailSummary(summary: EmailSummary) {
  return `Emails: ${summary.enviados} enviados, ${summary.fallidos} fallidos, ${summary.sinDestinatario} sin destinatario.`;
}
