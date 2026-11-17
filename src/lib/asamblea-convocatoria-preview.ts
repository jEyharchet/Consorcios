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
  /** Espacio entre el párrafo de cierre y la firma (px). Null = valor por defecto. */
  firmaEspacioPx?: number | null;
  /** Alto máximo de la imagen de la firma (px). Null = valor por defecto. */
  firmaAltoPx?: number | null;
};

export const FIRMA_ESPACIO_PX = { min: 0, max: 80, defecto: 40 } as const;
export const FIRMA_ALTO_PX = { min: 50, max: 110, defecto: 110 } as const;

function acotar(valor: number | null | undefined, rango: { min: number; max: number; defecto: number }) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return rango.defecto;
  return Math.min(rango.max, Math.max(rango.min, Math.round(valor)));
}

export function normalizarFirmaEspacioPx(valor: number | null | undefined) {
  return acotar(valor, FIRMA_ESPACIO_PX);
}

export function normalizarFirmaAltoPx(valor: number | null | undefined) {
  return acotar(valor, FIRMA_ALTO_PX);
}

/** Lee un ajuste de firma de un formulario: vacío o igual al valor por defecto se guarda como null. */
export function parseAjusteFirma(valor: FormDataEntryValue | null, rango: { min: number; max: number; defecto: number }) {
  const texto = valor?.toString().trim() ?? "";
  if (!texto) return null;
  const numero = acotar(Number(texto), rango);
  return numero === rango.defecto ? null : numero;
}

/**
 * Hoja A4 en px CSS (96 dpi): 210 × 297 mm. Los márgenes se usan igual en la
 * previsualización y en el `@page` / `page.pdf()` del PDF, para que ambos
 * corten las hojas en el mismo lugar.
 */
export const CONVOCATORIA_PAGINA = {
  anchoPx: 794,
  altoPx: 1123,
  margenVerticalPx: 56,
  margenHorizontalPx: 60,
} as const;

export const CONVOCATORIA_CONTENIDO_ANCHO_PX =
  CONVOCATORIA_PAGINA.anchoPx - CONVOCATORIA_PAGINA.margenHorizontalPx * 2;
export const CONVOCATORIA_CONTENIDO_ALTO_PX =
  CONVOCATORIA_PAGINA.altoPx - CONVOCATORIA_PAGINA.margenVerticalPx * 2;

export const CONVOCATORIA_FONT_FAMILY = "Arial, Helvetica, sans-serif";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

/**
 * Cada bloque es una unidad que no se parte entre hojas (`break-inside: avoid`).
 * Se usa `padding-bottom` en lugar de márgenes para que la altura de cada bloque
 * medida en la previsualización sea exactamente la que ocupa en el PDF.
 */
function block(content: string, spacingPx: number) {
  return `<div style="display:flow-root;break-inside:avoid;page-break-inside:avoid;padding-bottom:${spacingPx}px;">${content}</div>`;
}

const sectionTitleStyle =
  "margin:0 0 10px 0;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#334155;";

function ordenItemHtml(numero: number, titulo: string) {
  return `
    <div style="display:flex;gap:8px;font-size:14px;line-height:1.45;color:#0f172a;">
      <div style="flex:0 0 24px;text-align:right;font-weight:700;color:#334155;">${numero}.</div>
      <div style="flex:1;min-width:0;">${escapeHtml(titulo)}</div>
    </div>
  `;
}

function firmaHtml(data: AsambleaConvocatoriaPreviewData) {
  const altoFirma = normalizarFirmaAltoPx(data.firmaAltoPx);
  if (data.firmaUrl || data.firmaAclaracion?.trim() || data.firmaRol?.trim()) {
    return `
      <div style="display:flex;justify-content:flex-end;">
        <div style="width:360px;text-align:center;">
          ${
            data.firmaUrl
              ? `<img src="${escapeHtml(data.firmaUrl)}" alt="Firma del administrador" style="display:block;max-width:300px;max-height:${altoFirma}px;width:auto;height:auto;object-fit:contain;margin:0 auto 6px;" />`
              : ""
          }
          <div style="width:260px;margin:0 auto;border-top:1px solid #94a3b8;"></div>
          <div style="margin-top:12px;font-size:13px;font-weight:700;color:#334155;">
            ${escapeHtml(data.firmaAclaracion?.trim() || "Aclaración")}
          </div>
          <div style="margin-top:2px;font-size:12px;color:#64748b;">
            ${escapeHtml(data.firmaRol?.trim() || "Administrador")}
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div style="display:flex;justify-content:flex-end;">
      <div style="width:360px;text-align:center;">
        <div style="height:${Math.round(altoFirma * 0.45)}px;"></div>
        <div style="width:260px;margin:0 auto;border-top:1px solid #94a3b8;"></div>
        <div style="margin-top:12px;font-size:13px;color:#475569;">Firma</div>
        <div style="margin-top:2px;font-size:13px;color:#475569;">Aclaración</div>
      </div>
    </div>
  `;
}

/**
 * Devuelve el documento como una lista de bloques indivisibles, en orden.
 * La previsualización los mide y los reparte en hojas A4; el PDF los concatena
 * y deja que Chromium pagine respetando `break-inside: avoid`.
 */
export function buildAsambleaConvocatoriaBlocks(data: AsambleaConvocatoriaPreviewData): string[] {
  const logo = data.logoUrl?.trim() || "/branding/logo-gray-v2.png";
  const items = data.ordenDelDia.map((item) => item.titulo.trim()).filter((titulo) => titulo.length > 0);
  const blocks: string[] = [];

  blocks.push(
    block(
      `
        <div style="display:flex;align-items:center;gap:18px;border-bottom:1px solid #dbe3ec;padding-bottom:16px;">
          <div style="width:150px;flex:0 0 150px;display:flex;align-items:center;justify-content:center;">
            <img src="${escapeHtml(logo)}" alt="AmiConsorcio" style="display:block;width:140px;height:auto;" />
          </div>
          <div style="width:1px;align-self:stretch;background:#dbe3ec;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:24px;font-weight:700;letter-spacing:0.04em;line-height:1.2;color:#111827;">CONVOCATORIA A ASAMBLEA</div>
            <div style="margin-top:8px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#475569;">
              CONSORCIO DE PROPIETARIOS - ${escapeHtml(data.consorcioNombre)}
            </div>
          </div>
        </div>
      `,
      22,
    ),
  );

  blocks.push(
    block(
      `<p style="margin:0;font-size:14px;line-height:1.7;color:#1f2937;">
        Por la presente se convoca a los propietarios del ${escapeHtml(data.consorcioNombreLegal)}, a la ${escapeHtml(buildTipoLabel(data.tipo))}, que se celebrará conforme al Reglamento de Propiedad y Administración.
      </p>`,
      18,
    ),
  );

  blocks.push(
    block(
      `
        <div style="border:1px solid #dbe3ec;border-radius:10px;background:#f8fafc;padding:12px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;font-size:13px;line-height:1.35;color:#0f172a;">
            <div style="flex:1 1 0;min-width:0;">
              <div style="font-weight:700;color:#475569;">Fecha:</div>
              <div style="margin-top:4px;">${escapeHtml(formatFecha(data.fecha))}</div>
            </div>
            <div style="flex:0 0 90px;">
              <div style="font-weight:700;color:#475569;">Hora:</div>
              <div style="margin-top:4px;">${escapeHtml(data.hora || "A completar")}</div>
            </div>
            <div style="flex:1 1 0;min-width:0;">
              <div style="font-weight:700;color:#475569;">Lugar:</div>
              <div style="margin-top:4px;">${escapeHtml(data.lugar || "A completar")}</div>
            </div>
          </div>
        </div>
      `,
      24,
    ),
  );

  // El título de la sección viaja con el primer punto para no quedar solo al pie de una hoja.
  if (items.length === 0) {
    blocks.push(
      block(
        `<div style="${sectionTitleStyle}">ORDEN DEL DÍA</div>
         <div style="font-size:14px;color:#64748b;">Orden del día pendiente de definición.</div>`,
        24,
      ),
    );
  } else {
    items.forEach((titulo, index) => {
      const isLast = index === items.length - 1;
      const titleHtml = index === 0 ? `<div style="${sectionTitleStyle}">ORDEN DEL DÍA</div>` : "";
      blocks.push(block(`${titleHtml}${ordenItemHtml(index + 1, titulo)}`, isLast ? 24 : 10));
    });
  }

  const parrafosObservaciones = (data.observaciones ?? "")
    .split(/\n\s*\n/)
    .map((parrafo) => parrafo.trim())
    .filter((parrafo) => parrafo.length > 0);

  parrafosObservaciones.forEach((parrafo, index) => {
    const isLast = index === parrafosObservaciones.length - 1;
    const titleHtml = index === 0 ? `<div style="${sectionTitleStyle}">OBSERVACIONES</div>` : "";
    blocks.push(
      block(
        `${titleHtml}<div style="font-size:13px;line-height:1.65;color:#334155;">${escapeHtml(parrafo).replace(/\n/g, "<br />")}</div>`,
        isLast ? 22 : 10,
      ),
    );
  });

  blocks.push(
    block(
      `<p style="margin:0;font-size:14px;line-height:1.7;color:#1f2937;">
        Se deja constancia que la presente convocatoria se realiza conforme a lo dispuesto en el Reglamento de Propiedad y Administración, cursándose en forma escrita y con la antelación allí prevista.
      </p>`,
      normalizarFirmaEspacioPx(data.firmaEspacioPx),
    ),
  );

  blocks.push(block(firmaHtml(data), 0));

  return blocks;
}

/** Contenido continuo para el PDF: Chromium lo pagina con los márgenes de `@page`. */
export function buildAsambleaConvocatoriaPreviewHtml(data: AsambleaConvocatoriaPreviewData) {
  return `<div style="box-sizing:border-box;font-family:${CONVOCATORIA_FONT_FAMILY};color:#0f172a;">${buildAsambleaConvocatoriaBlocks(data).join("")}</div>`;
}

/**
 * Reparte bloques en hojas sin partir ninguno (mismo criterio que `break-inside: avoid`).
 * Un bloque más alto que una hoja ocupa una hoja propia.
 */
export function paginarBloques(alturas: number[], altoDisponible: number): number[][] {
  const paginas: number[][] = [];
  let actual: number[] = [];
  let usado = 0;

  alturas.forEach((altura, index) => {
    if (actual.length > 0 && usado + altura > altoDisponible) {
      paginas.push(actual);
      actual = [];
      usado = 0;
    }
    actual.push(index);
    usado += altura;
  });

  if (actual.length > 0) {
    paginas.push(actual);
  }

  return paginas;
}
