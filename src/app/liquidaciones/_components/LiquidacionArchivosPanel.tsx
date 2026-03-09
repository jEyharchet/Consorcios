"use client";

import { useMemo, useState } from "react";

import RegenerarArchivosButton from "./RegenerarArchivosButton";

type ArchivoItem = {
  id: number;
  tipoArchivo: string;
  nombreArchivo: string;
  rutaArchivo: string;
};

type Props = {
  liquidacionId: number;
  archivos: ArchivoItem[];
  canRegenerate: boolean;
};

function labelArchivo(archivo: ArchivoItem) {
  return archivo.tipoArchivo === "RENDICION" ? "Rendicion final PDF" : `Boleta - ${archivo.nombreArchivo}`;
}

async function postSeleccionDescarga(liquidacionId: number, archivoIds: number[]) {
  const response = await fetch(`/api/liquidaciones/${liquidacionId}/archivos/seleccionados`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ archivoIds }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.reason ?? "No se pudo preparar la descarga");
  }

  return payload as { ok: true; archivos: Array<{ id: number; nombreArchivo: string; rutaArchivo: string }> };
}

function triggerBrowserDownload(url: string, fileName?: string) {
  const link = document.createElement("a");
  link.href = url;
  if (fileName) {
    link.download = fileName;
  }
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function LiquidacionArchivosPanel({ liquidacionId, archivos, canRegenerate }: Props) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = useMemo(
    () => archivos.length > 0 && selectedIds.length === archivos.length,
    [archivos.length, selectedIds.length],
  );

  const selectedCount = selectedIds.length;

  function enterSelectionMode() {
    setSelectionMode(true);
    setSelectedIds([]);
    setMessage(null);
    setError(null);
  }

  function cancelSelectionMode() {
    setSelectionMode(false);
    setSelectedIds([]);
    setDownloading(false);
    setError(null);
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(archivos.map((a) => a.id));
    }
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function downloadSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    setDownloading(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await postSeleccionDescarga(liquidacionId, selectedIds);

      for (const archivo of payload.archivos) {
        triggerBrowserDownload(archivo.rutaArchivo, archivo.nombreArchivo);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      setMessage(`Descarga iniciada para ${payload.archivos.length} archivo(s).`);
      setSelectionMode(false);
      setSelectedIds([]);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "No se pudo iniciar la descarga");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section id="archivos" className="mt-8">
      <h2 className="text-xl font-semibold">Archivos generados</h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!selectionMode ? (
          <button
            type="button"
            onClick={enterSelectionMode}
            disabled={archivos.length === 0}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Descargar
          </button>
        ) : (
          <>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-slate-300"
              />
              Seleccionar todo
            </label>
            <button
              type="button"
              onClick={downloadSelected}
              disabled={selectedCount === 0 || downloading}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? "Preparando..." : "Descargar seleccionados"}
            </button>
            <button
              type="button"
              onClick={cancelSelectionMode}
              disabled={downloading}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </>
        )}

        {canRegenerate ? <RegenerarArchivosButton liquidacionId={liquidacionId} /> : null}
      </div>

      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
        {error ? (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {message ? (
          <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}

        {archivos.length === 0 ? (
          <p className="text-sm text-slate-500">Esta liquidacion aun no tiene archivos generados.</p>
        ) : (
          <>
            <ul className="space-y-2 text-sm">
              {archivos.map((archivo) => (
                <li key={archivo.id} className="flex items-start gap-2">
                  {selectionMode ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(archivo.id)}
                      onChange={() => toggleOne(archivo.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                  ) : null}
                  <a href={archivo.rutaArchivo} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    {labelArchivo(archivo)}
                  </a>
                </li>
              ))}
            </ul>
            {!selectionMode ? (
              <p className="mt-3 text-xs text-slate-500">
                Descarga multiple disponible en modo seleccion. Actualmente se inicia una descarga por archivo.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
