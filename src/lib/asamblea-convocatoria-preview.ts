type OrdenDiaItem = {
  titulo: string;
  descripcion?: string | null;
};

export type AsambleaConvocatoriaPreviewData = {
  consorcioNombre: string;
  tipo: string;
  fecha: string;
  hora: string;
  lugar: string;
  convocatoriaTexto: string;
  ordenDelDia: OrdenDiaItem[];
  logoUrl?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toParagraphs(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function formatFecha(value: string) {
  if (!value) return "A completar";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildTipoLabel(tipo: string) {
  const normalized = tipo === "EXTRAORDINARIA" ? "EXTRAORDINARIA" : "ORDINARIA";
  return `PRIMERA ASAMBLEA ${normalized}`;
}

export function getDefaultConvocatoriaTexto(consorcioNombre: string) {
  return `Se convoca a los propietarios del ${consorcioNombre} a participar de la asamblea en la fecha, hora y lugar indicados a continuacion.`;
}

export function buildAsambleaConvocatoriaPreviewHtml(data: AsambleaConvocatoriaPreviewData) {
  const logo = data.logoUrl?.trim() || "/branding/logo-gray-v2.png";
  const cierreTexto =
    data.convocatoriaTexto.trim() || getDefaultConvocatoriaTexto(data.consorcioNombre);

  const items = data.ordenDelDia.filter((item) => item.titulo.trim().length > 0);

  const ordenDelDiaHtml =
    items.length > 0
      ? items
          .map(
            (item, index) => `
              <li style="margin-bottom:12px;">
                <div style="font-weight:700;color:#0f172a;">${index + 1}. ${escapeHtml(item.titulo.trim())}</div>
                ${
                  item.descripcion?.trim()
                    ? `<div style="margin-top:4px;color:#475569;line-height:1.55;">${toParagraphs(item.descripcion.trim())}</div>`
                    : ""
                }
              </li>
            `,
          )
          .join("")
      : `<li style="color:#64748b;">Orden del dia pendiente de definicion.</li>`;

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
      <div style="max-width:794px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:34px 38px 44px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <header style="border-bottom:1px solid #dbe3ec;padding-bottom:18px;margin-bottom:26px;">
          <img src="${escapeHtml(logo)}" alt="AmiConsorcio" style="display:block;width:148px;height:auto;margin-bottom:14px;" />
          <div style="font-size:24px;font-weight:700;letter-spacing:0.04em;color:#111827;">CONVOCATORIA A ASAMBLEA</div>
          <div style="margin-top:8px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#475569;">
            CONSORCIO DE PROPIETARIOS - ${escapeHtml(data.consorcioNombre)}
          </div>
        </header>

        <section style="font-size:14px;line-height:1.75;color:#1f2937;">
          <p style="margin:0 0 18px 0;">
            Por la presente se convoca a los senores propietarios del ${escapeHtml(data.consorcioNombre)},
            a la ${escapeHtml(buildTipoLabel(data.tipo))}, que se celebrara conforme al Reglamento de Propiedad y Administracion.
          </p>

          <div style="margin:20px 0 26px;border:1px solid #dbe3ec;border-radius:10px;background:#f8fafc;padding:18px 20px;">
            <div style="display:grid;grid-template-columns:120px 1fr;row-gap:10px;column-gap:14px;font-size:14px;">
              <div style="font-weight:700;color:#475569;">Fecha:</div>
              <div>${escapeHtml(formatFecha(data.fecha))}</div>
              <div style="font-weight:700;color:#475569;">Hora:</div>
              <div>${escapeHtml(data.hora || "A completar")}</div>
              <div style="font-weight:700;color:#475569;">Lugar:</div>
              <div>${escapeHtml(data.lugar || "A completar")}</div>
            </div>
          </div>

          <div style="margin:0 0 14px 0;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#334155;">ORDEN DEL DIA</div>
          <ol style="margin:0 0 26px 20px;padding:0;">
            ${ordenDelDiaHtml}
          </ol>

          <p style="margin:0 0 18px 0;">${toParagraphs(cierreTexto)}</p>

          <p style="margin:0 0 28px 0;">
            Se deja constancia que la presente convocatoria se realiza conforme a lo dispuesto en el Reglamento de Propiedad y Administracion,
            cursandose en forma escrita y con la antelacion alli prevista.
          </p>
        </section>

        <footer style="margin-top:44px;padding-top:22px;border-top:1px solid #dbe3ec;">
          <div style="max-width:280px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;color:#64748b;">Administrador / Convocante</div>
            <div style="margin-top:28px;border-top:1px solid #94a3b8;"></div>
            <div style="margin-top:10px;font-size:13px;color:#475569;">Firma</div>
            <div style="margin-top:22px;border-top:1px solid #94a3b8;"></div>
            <div style="margin-top:10px;font-size:13px;color:#475569;">Aclaracion</div>
          </div>
        </footer>
      </div>
    </div>
  `;
}
