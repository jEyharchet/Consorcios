"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { ASAMBLEA_TIPO } from "@/lib/administracion-shared";
import {
  buildAsambleaConvocatoriaBlocks,
  FIRMA_ALTO_PX,
  FIRMA_ESPACIO_PX,
} from "@/lib/asamblea-convocatoria-preview";

import ConvocatoriaPaginada from "./ConvocatoriaPaginada";

type OrdenDiaDraft = {
  id: string;
  /** Id del punto ya guardado (borradores); null para puntos nuevos. */
  dbId: number | null;
  titulo: string;
};

export type AsambleaEditorInicial = {
  asambleaId: number;
  tipo: string;
  fecha: string;
  hora: string;
  lugar: string;
  observaciones: string;
  firmaEspacioPx: number;
  firmaAltoPx: number;
  ordenDelDia: Array<{ id: number; titulo: string }>;
};

type Props = {
  action: (formData: FormData) => void;
  /** Valores de un borrador existente; sin esto el editor es de alta. */
  inicial?: AsambleaEditorInicial;
  consorcioId: number;
  consorcioNombre: string;
  consorcioNombreLegal: string;
  firmaUrl: string | null;
  firmaAclaracion?: string;
  firmaRol?: string;
};

// px CSS a mm (96 dpi), para mostrar los ajustes en una unidad de hoja.
function pxAMm(px: number) {
  return Math.round((px * 25.4) / 96);
}

type AsambleaTipo = (typeof ASAMBLEA_TIPO)[keyof typeof ASAMBLEA_TIPO];

let draftSequence = 0;

function createOrdenDiaDraft(titulo = "", dbId: number | null = null): OrdenDiaDraft {
  draftSequence += 1;
  return {
    id: `orden-${draftSequence}-${Date.now()}`,
    dbId,
    titulo,
  };
}

function autoSize(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

// Quita la numeración o viñeta de cada línea al pegar una lista ("1. ...", "2) ...", "- ...").
function limpiarLinea(linea: string) {
  return linea.replace(/^\s*(\d+\s*[.)-]|[-•*])\s*/, "").trim();
}

export default function NuevaAsambleaEditor({
  action,
  inicial,
  consorcioId,
  consorcioNombre,
  consorcioNombreLegal,
  firmaUrl,
  firmaAclaracion,
  firmaRol,
}: Props) {
  const [tipo, setTipo] = useState<AsambleaTipo>(
    inicial?.tipo === ASAMBLEA_TIPO.EXTRAORDINARIA ? ASAMBLEA_TIPO.EXTRAORDINARIA : ASAMBLEA_TIPO.ORDINARIA,
  );
  const [fecha, setFecha] = useState(inicial?.fecha ?? "");
  const [hora, setHora] = useState(inicial?.hora ?? "");
  const [lugar, setLugar] = useState(inicial?.lugar ?? "");
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? "");
  const [firmaEspacioPx, setFirmaEspacioPx] = useState<number>(inicial?.firmaEspacioPx ?? FIRMA_ESPACIO_PX.defecto);
  const [firmaAltoPx, setFirmaAltoPx] = useState<number>(inicial?.firmaAltoPx ?? FIRMA_ALTO_PX.defecto);
  const [firmaSola, setFirmaSola] = useState(false);
  const [ordenDelDia, setOrdenDelDia] = useState<OrdenDiaDraft[]>(() =>
    inicial && inicial.ordenDelDia.length > 0
      ? inicial.ordenDelDia.map((item) => createOrdenDiaDraft(item.titulo, item.id))
      : [createOrdenDiaDraft(), createOrdenDiaDraft()],
  );
  const inputRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const [focusId, setFocusId] = useState<string | null>(null);

  const bloques = useMemo(
    () =>
      buildAsambleaConvocatoriaBlocks({
        consorcioNombre,
        consorcioNombreLegal,
        tipo,
        fecha,
        hora,
        lugar,
        observaciones,
        ordenDelDia,
        firmaUrl,
        firmaAclaracion,
        firmaRol,
        firmaEspacioPx,
        firmaAltoPx,
      }),
    [
      consorcioNombre,
      consorcioNombreLegal,
      tipo,
      fecha,
      hora,
      lugar,
      observaciones,
      ordenDelDia,
      firmaUrl,
      firmaAclaracion,
      firmaRol,
      firmaEspacioPx,
      firmaAltoPx,
    ],
  );

  const puntosCargados = ordenDelDia.filter((item) => item.titulo.trim().length > 0).length;

  useEffect(() => {
    if (!focusId) return;
    const element = inputRefs.current.get(focusId);
    if (element) {
      element.focus();
      const end = element.value.length;
      element.setSelectionRange(end, end);
    }
    setFocusId(null);
  }, [focusId, ordenDelDia]);

  function updateOrdenDia(id: string, value: string) {
    setOrdenDelDia((current) =>
      current.map((item) => (item.id === id ? { ...item, titulo: value } : item)),
    );
  }

  function insertOrdenDia(afterIndex: number, titulos: string[] = [""]) {
    const nuevos = titulos.map((titulo) => createOrdenDiaDraft(titulo));
    setOrdenDelDia((current) => [
      ...current.slice(0, afterIndex + 1),
      ...nuevos,
      ...current.slice(afterIndex + 1),
    ]);
    setFocusId(nuevos[nuevos.length - 1].id);
  }

  function addOrdenDia() {
    insertOrdenDia(ordenDelDia.length - 1);
  }

  function removeOrdenDia(id: string) {
    const index = ordenDelDia.findIndex((item) => item.id === id);
    if (ordenDelDia.length <= 1 || index < 0) return;
    const vecino = ordenDelDia[index - 1] ?? ordenDelDia[index + 1];
    setOrdenDelDia((current) => current.filter((item) => item.id !== id));
    setFocusId(vecino?.id ?? null);
  }

  function moveOrdenDia(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= ordenDelDia.length) return;
    setOrdenDelDia((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleOrdenKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, index: number, item: OrdenDiaDraft) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      insertOrdenDia(index);
      return;
    }

    if (event.key === "Backspace" && item.titulo.length === 0 && ordenDelDia.length > 1) {
      event.preventDefault();
      removeOrdenDia(item.id);
      return;
    }

    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      moveOrdenDia(index, event.key === "ArrowUp" ? -1 : 1);
      setFocusId(item.id);
    }
  }

  // Pegar una lista (un punto por línea) la reparte en varios puntos.
  function handleOrdenPaste(event: ClipboardEvent<HTMLTextAreaElement>, index: number, item: OrdenDiaDraft) {
    const lineas = event.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .map(limpiarLinea)
      .filter((linea) => linea.length > 0);

    if (lineas.length <= 1) return;

    event.preventDefault();
    const [primera, ...resto] = lineas;
    updateOrdenDia(item.id, item.titulo.trim() ? `${item.titulo.trim()} ${primera}` : primera);
    insertOrdenDia(index, resto);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <form action={action} className="space-y-5 self-start rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="consorcioId" value={consorcioId} />
        {inicial ? <input type="hidden" name="asambleaId" value={inicial.asambleaId} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="tipo" className="text-sm font-medium text-slate-700">
              Tipo
            </label>
            <select
              id="tipo"
              name="tipo"
              value={tipo}
              onChange={(event) => setTipo(event.target.value as AsambleaTipo)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={ASAMBLEA_TIPO.ORDINARIA}>ORDINARIA</option>
              <option value={ASAMBLEA_TIPO.EXTRAORDINARIA}>EXTRAORDINARIA</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="lugar" className="text-sm font-medium text-slate-700">
              Lugar
            </label>
            <input
              id="lugar"
              name="lugar"
              value={lugar}
              onChange={(event) => setLugar(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="fecha" className="text-sm font-medium text-slate-700">
              Fecha
            </label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="hora" className="text-sm font-medium text-slate-700">
              Hora
            </label>
            <input
              id="hora"
              name="hora"
              type="time"
              value={hora}
              onChange={(event) => setHora(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Orden del día <span className="font-normal text-slate-500">({puntosCargados})</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Enter agrega un punto debajo · Alt+↑/↓ reordena · pegar una lista crea un punto por línea.
          </p>

          <ol className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
            {ordenDelDia.map((item, index) => (
              <li key={item.id} className="group flex items-start gap-1 px-2 py-1.5 focus-within:bg-blue-50/40">
                <span className="w-6 shrink-0 pt-1.5 text-right text-sm font-semibold tabular-nums text-slate-500">
                  {index + 1}.
                </span>
                <textarea
                  ref={(element) => {
                    if (element) {
                      inputRefs.current.set(item.id, element);
                      autoSize(element);
                    } else {
                      inputRefs.current.delete(item.id);
                    }
                  }}
                  rows={1}
                  value={item.titulo}
                  aria-label={`Punto ${index + 1}`}
                  placeholder="Título del punto"
                  onChange={(event) => {
                    updateOrdenDia(item.id, event.target.value.replace(/\r?\n/g, " "));
                    autoSize(event.target);
                  }}
                  onKeyDown={(event) => handleOrdenKeyDown(event, index, item)}
                  onPaste={(event) => handleOrdenPaste(event, index, item)}
                  className="min-w-0 flex-1 resize-none overflow-hidden rounded border border-transparent bg-transparent px-2 py-1 text-sm leading-5 text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none"
                />
                <div className="flex shrink-0 items-center pt-0.5 opacity-40 transition group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => moveOrdenDia(index, -1)}
                    disabled={index === 0}
                    title="Subir"
                    aria-label={`Subir punto ${index + 1}`}
                    className="rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:invisible"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveOrdenDia(index, 1)}
                    disabled={index === ordenDelDia.length - 1}
                    title="Bajar"
                    aria-label={`Bajar punto ${index + 1}`}
                    className="rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:invisible"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOrdenDia(item.id)}
                    disabled={ordenDelDia.length <= 1}
                    title="Quitar"
                    aria-label={`Quitar punto ${index + 1}`}
                    className="rounded px-1.5 py-1 text-sm text-red-600 hover:bg-red-50 disabled:invisible"
                  >
                    ×
                  </button>
                </div>
                <input type="hidden" name="ordenId" value={item.dbId ?? ""} />
                <input type="hidden" name="ordenTitulo" value={item.titulo} />
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={addOrdenDia}
            className="mt-2 w-full rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-white"
          >
            + Agregar punto
          </button>
        </section>

        <div className="space-y-1">
          <label htmlFor="observaciones" className="text-sm font-medium text-slate-700">
            Observaciones
          </label>
          <textarea
            id="observaciones"
            name="observaciones"
            rows={4}
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">Una línea en blanco separa párrafos; cada párrafo puede pasar a otra hoja sin cortarse.</p>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Firma</legend>
          {firmaSola ? (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              La firma quedó sola en la última hoja. Reducí el espacio o el alto de la firma para acercarla a la hoja anterior.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="firmaEspacioPx" className="flex justify-between text-xs font-medium text-slate-600">
                <span>Espacio antes de la firma</span>
                <span className="tabular-nums text-slate-500">{pxAMm(firmaEspacioPx)} mm</span>
              </label>
              <input
                id="firmaEspacioPx"
                name="firmaEspacioPx"
                type="range"
                min={FIRMA_ESPACIO_PX.min}
                max={FIRMA_ESPACIO_PX.max}
                step={2}
                value={firmaEspacioPx}
                onChange={(event) => setFirmaEspacioPx(Number(event.target.value))}
                className="w-full accent-slate-900"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="firmaAltoPx" className="flex justify-between text-xs font-medium text-slate-600">
                <span>Alto de la firma</span>
                <span className="tabular-nums text-slate-500">{pxAMm(firmaAltoPx)} mm</span>
              </label>
              <input
                id="firmaAltoPx"
                name="firmaAltoPx"
                type="range"
                min={FIRMA_ALTO_PX.min}
                max={FIRMA_ALTO_PX.max}
                step={2}
                value={firmaAltoPx}
                onChange={(event) => setFirmaAltoPx(Number(event.target.value))}
                className="w-full accent-slate-900"
              />
            </div>
          </div>
          {!firmaUrl ? (
            <p className="mt-2 text-xs text-slate-500">
              El administrador vigente no tiene firma cargada: se deja el espacio para firmar a mano.
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            name="intent"
            value="borrador"
            formNoValidate
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Guardar borrador
          </button>
          <button
            type="submit"
            name="intent"
            value="crear"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {inicial ? "Guardar e ir a la asamblea" : "Crear asamblea"}
          </button>
          <p className="w-full text-xs text-slate-500">
            El borrador se guarda aunque falten fecha, hora o lugar. Para convocar hay que completarlos.
          </p>
        </div>
      </form>

      <section className="self-start rounded-xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Previsualización del documento</h2>
          <p className="mt-1 text-sm text-slate-500">Hojas A4 con los mismos márgenes y saltos de página que el PDF.</p>
        </div>

        <div className="max-h-[calc(100vh-150px)] overflow-y-auto bg-slate-100 p-5">
          <ConvocatoriaPaginada bloques={bloques} onFirmaSola={setFirmaSola} />
        </div>
      </section>
    </div>
  );
}
