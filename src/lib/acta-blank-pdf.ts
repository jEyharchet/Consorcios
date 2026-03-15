function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type BlankActaPdfParams = {
  consorcioNombre: string | null;
  logoUrl: string;
};

export function buildBlankActaPdfHtml(params: BlankActaPdfParams) {
  const consorcioNombre = params.consorcioNombre?.trim() || "Consorcio";

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4;
            margin: 22mm 16mm 18mm;
          }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
          }

          .sheet {
            width: 100%;
          }

          .header {
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 14px;
            margin-bottom: 20px;
          }

          .logo {
            display: block;
            width: 140px;
            margin: 0 0 14px 0;
          }

          .title {
            margin: 0;
            font-size: 22pt;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #111827;
          }

          .subtitle {
            margin: 8px 0 0 0;
            font-size: 11pt;
            color: #475569;
          }

          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 18px;
          }

          .meta-box,
          .section {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px 14px;
          }

          .label {
            margin: 0 0 8px 0;
            font-size: 9pt;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #475569;
          }

          .line {
            border-bottom: 1px solid #94a3b8;
            height: 24px;
          }

          .section {
            margin-bottom: 14px;
          }

          .section.large {
            min-height: 150px;
          }

          .section.medium {
            min-height: 90px;
          }

          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-top: 24px;
          }

          .signature-box {
            padding-top: 30px;
          }

          .signature-line {
            border-top: 1px solid #64748b;
            padding-top: 8px;
            font-size: 10pt;
            color: #475569;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header class="header">
            <img class="logo" src="${escapeHtml(params.logoUrl)}" alt="AmiConsorcio" />
            <h1 class="title">ACTA</h1>
            <p class="subtitle">${escapeHtml(consorcioNombre)}</p>
          </header>

          <section class="meta-grid">
            <div class="meta-box">
              <p class="label">Fecha</p>
              <div class="line"></div>
            </div>
            <div class="meta-box">
              <p class="label">Lugar</p>
              <div class="line"></div>
            </div>
          </section>

          <section class="section medium">
            <p class="label">Asistentes</p>
          </section>

          <section class="section medium">
            <p class="label">Orden del dia</p>
          </section>

          <section class="section large">
            <p class="label">Desarrollo</p>
          </section>

          <section class="signatures">
            <div class="signature-box">
              <div class="signature-line">Firma</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Aclaracion</div>
            </div>
          </section>
        </main>
      </body>
    </html>
  `;
}
