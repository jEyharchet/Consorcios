type OrdenDiaItem = {
  titulo: string;
};

export type AsambleaConvocatoriaPreviewData = {
  consorcioNombre: string;
  consorcioNombreLegal: string;
  tipo: string;
  fecha: string;
  hora: string;
  lugar: string;
  observaciones?: string;
  ordenDelDia: OrdenDiaItem[];
  logoUrl?: string;
  firmaUrl?: string | null;
  firmaAclaracion?: string;
  firmaRol?: string;
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

export function buildAsambleaConvocatoriaPreviewHtml(data: AsambleaConvocatoriaPreviewData) {
  const logo = data.logoUrl?.trim() || "/branding/logo-gray-v2.png";
  const items = data.ordenDelDia.filter((item) => item.titulo.trim().length > 0);

  const ordenDelDiaHtml =
    items.length > 0
      ? items
          .map(
            (item) => `
              <li style="margin-bottom:10px;color:#0f172a;line-height:1.45;">
                ${escapeHtml(item.titulo.trim())}
              </li>
            `,
          )
          .join("")
      : `<li style="color:#64748b;">Orden del dia pendiente de definicion.</li>`;

  const observacionesHtml = data.observaciones?.trim()
    ? `
        <div style="margin:20px 0 0 0;">
          <div style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#334155;">OBSERVACIONES</div>
          <div style="font-size:13px;line-height:1.65;color:#334155;">
            ${toParagraphs(data.observaciones.trim())}
          </div>
        </div>
      `
    : "";

  const firmaHtml =
    data.firmaUrl || data.firmaAclaracion?.trim() || data.firmaRol?.trim()
      ? `
          <div style="display:flex;justify-content:flex-end;">
            <div style="width:420px;text-align:center;">
              <div style="display:flex;min-height:0;align-items:flex-end;justify-content:center;">
                ${
                  data.firmaUrl
                    ? `<img src="${escapeHtml(data.firmaUrl)}" alt="Firma del administrador" style="display:block;max-width:320px;max-height:120px;width:auto;height:auto;object-fit:contain;margin:0 auto 10px;" />`
                    : ``
                }
              </div>
              <div style="width:260px;margin:0 auto;border-top:1px solid #94a3b8;"></div>
              <div style="margin-top:12px;font-size:13px;font-weight:700;color:#334155;">
                ${escapeHtml(data.firmaAclaracion?.trim() || "Aclaracion")}
              </div>
              <div style="margin-top:2px;font-size:12px;color:#64748b;">
                ${escapeHtml(data.firmaRol?.trim() || "Administrador")}
              </div>
            </div>
          </div>
        `
      : `
          <div style="display:flex;justify-content:flex-end;">
            <div style="width:420px;text-align:center;">
              <div style="height:28px;"></div>
              <div style="width:260px;margin:0 auto;border-top:1px solid #94a3b8;"></div>
              <div style="margin-top:12px;font-size:13px;color:#475569;">Firma</div>
              <div style="margin-top:2px;font-size:13px;color:#475569;">Aclaracion</div>
            </div>
          </div>
        `;

  return `
    <div style="box-sizing:border-box;font-family:Arial,sans-serif;background:#fff;color:#0f172a;padding:48px 52px 58px;">
      <div style="box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:28px 30px 36px;">
        <header style="border-bottom:1px solid #dbe3ec;padding-bottom:16px;margin-bottom:22px;">
          <div style="display:flex;align-items:center;gap:18px;">
            <div style="width:154px;display:flex;align-items:center;justify-content:center;flex:0 0 154px;">
              <img src="${escapeHtml(logo)}" alt="AmiConsorcio" style="display:block;width:142px;height:auto;" />
            </div>
            <div style="width:1px;align-self:stretch;background:#dbe3ec;"></div>
            <div style="flex:1;display:flex;flex-direction:column;justify-content:center;">
              <div style="font-size:24px;font-weight:700;letter-spacing:0.04em;color:#111827;">CONVOCATORIA A ASAMBLEA</div>
              <div style="margin-top:8px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#475569;">
                CONSORCIO DE PROPIETARIOS - ${escapeHtml(data.consorcioNombre)}
              </div>
            </div>
          </div>
        </header>

        <section style="font-size:14px;line-height:1.72;color:#1f2937;">
          <p style="margin:0 0 18px 0;">
            Por la presente se convoca a los propietarios del ${escapeHtml(data.consorcioNombreLegal)}, a la ${escapeHtml(buildTipoLabel(data.tipo))}, que se celebrara conforme al Reglamento de Propiedad y Administracion.
          </p>

          <div style="margin:18px 0 24px;border:1px solid #dbe3ec;border-radius:10px;background:#f8fafc;padding:12px 16px;">
            <div style="display:grid;grid-template-columns:96px 1fr;row-gap:6px;column-gap:12px;font-size:13px;line-height:1.35;">
              <div style="font-weight:700;color:#475569;">Fecha:</div>
              <div>${escapeHtml(formatFecha(data.fecha))}</div>
              <div style="font-weight:700;color:#475569;">Hora:</div>
              <div>${escapeHtml(data.hora || "A completar")}</div>
              <div style="font-weight:700;color:#475569;">Lugar:</div>
              <div>${escapeHtml(data.lugar || "A completar")}</div>
            </div>
          </div>

          <div style="margin:0 0 12px 0;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#334155;">ORDEN DEL DIA</div>
          <ol style="margin:0 0 24px 20px;padding:0;">
            ${ordenDelDiaHtml}
          </ol>

          ${observacionesHtml}

          <p style="margin:20px 0 0 0;">
            Se deja constancia que la presente convocatoria se realiza conforme a lo dispuesto en el Reglamento de Propiedad y Administracion,
            cursandose en forma escrita y con la antelacion alli prevista.
          </p>
        </section>

        <div style="margin-top:28px;padding-top:0;">
          ${firmaHtml}
        </div>
      </div>
    </div>
  `;
}
