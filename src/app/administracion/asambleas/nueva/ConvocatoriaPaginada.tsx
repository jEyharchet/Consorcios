"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  CONVOCATORIA_CONTENIDO_ALTO_PX,
  CONVOCATORIA_CONTENIDO_ANCHO_PX,
  CONVOCATORIA_FONT_FAMILY,
  CONVOCATORIA_PAGINA,
  paginarBloques,
} from "@/lib/asamblea-convocatoria-preview";

// Margen de seguridad: la fuente del navegador y la del Chromium del PDF pueden diferir apenas.
const HOLGURA_PX = 6;

type Props = {
  bloques: string[];
  /** Avisa si el último bloque (la firma) quedó solo en una hoja. */
  onFirmaSola?: (firmaSola: boolean) => void;
};

/**
 * Previsualiza la convocatoria como hojas A4 reales: mide cada bloque con el ancho útil
 * de la hoja, los reparte en páginas y escala las hojas al ancho disponible.
 */
export default function ConvocatoriaPaginada({ bloques, onFirmaSola }: Props) {
  const medidorRef = useRef<HTMLDivElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState<number[][]>([bloques.map((_, index) => index)]);
  const [escala, setEscala] = useState(0.6);

  useLayoutEffect(() => {
    const medidor = medidorRef.current;
    if (!medidor) return;

    const medir = () => {
      const alturas = Array.from(medidor.children).map((child) => (child as HTMLElement).offsetHeight);
      setPaginas(paginarBloques(alturas, CONVOCATORIA_CONTENIDO_ALTO_PX - HOLGURA_PX));
    };

    medir();

    // Las imágenes (logo, firma) cambian la altura al terminar de cargar.
    const observer = new ResizeObserver(medir);
    observer.observe(medidor);
    return () => observer.disconnect();
  }, [bloques]);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    const actualizar = () => {
      setEscala(Math.min(1, contenedor.clientWidth / CONVOCATORIA_PAGINA.anchoPx));
    };

    actualizar();
    const observer = new ResizeObserver(actualizar);
    observer.observe(contenedor);
    return () => observer.disconnect();
  }, []);

  const total = paginas.length;
  const firmaSola = total > 1 && paginas[total - 1].length === 1;

  useEffect(() => {
    onFirmaSola?.(firmaSola);
  }, [firmaSola, onFirmaSola]);

  return (
    <div ref={contenedorRef} className="relative w-full">
      <div
        ref={medidorRef}
        aria-hidden
        style={{
          position: "absolute",
          left: -100000,
          top: 0,
          visibility: "hidden",
          pointerEvents: "none",
          width: CONVOCATORIA_CONTENIDO_ANCHO_PX,
          fontFamily: CONVOCATORIA_FONT_FAMILY,
        }}
      >
        {bloques.map((html, index) => (
          <div key={index} style={{ display: "flow-root" }} dangerouslySetInnerHTML={{ __html: html }} />
        ))}
      </div>

      <div className="space-y-5">
        {paginas.map((indices, numero) => (
          <div key={numero}>
            <div
              className="mx-auto overflow-hidden"
              style={{
                width: CONVOCATORIA_PAGINA.anchoPx * escala,
                height: CONVOCATORIA_PAGINA.altoPx * escala,
              }}
            >
              <div
                className="bg-white shadow-md ring-1 ring-slate-300"
                style={{
                  boxSizing: "border-box",
                  width: CONVOCATORIA_PAGINA.anchoPx,
                  height: CONVOCATORIA_PAGINA.altoPx,
                  padding: `${CONVOCATORIA_PAGINA.margenVerticalPx}px ${CONVOCATORIA_PAGINA.margenHorizontalPx}px`,
                  overflow: "hidden",
                  transform: `scale(${escala})`,
                  transformOrigin: "top left",
                  fontFamily: CONVOCATORIA_FONT_FAMILY,
                  color: "#0f172a",
                }}
                dangerouslySetInnerHTML={{
                  __html: indices.map((index) => bloques[index]).join(""),
                }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              Hoja {numero + 1} de {total}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
