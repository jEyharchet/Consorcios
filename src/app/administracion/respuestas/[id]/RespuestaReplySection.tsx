"use client";

import { useEffect, useState } from "react";

import RespuestaRichComposer from "./RespuestaRichComposer";

export default function RespuestaReplySection({ receivedBody }: { receivedBody: string }) {
  const [isReplying, setIsReplying] = useState(false);

  useEffect(() => {
    const onStartReply = () => setIsReplying(true);

    window.addEventListener("amiconsorcio:reply-start", onStartReply);
    return () => window.removeEventListener("amiconsorcio:reply-start", onStartReply);
  }, []);

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Contenido</h3>
        {isReplying ? (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Respondiendo</span>
            <button
              type="button"
              onClick={() => setIsReplying(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        ) : null}
      </div>

      {isReplying ? (
        <div className="mt-3">
          <RespuestaRichComposer active />
        </div>
      ) : (
        <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
          {receivedBody || "No se pudo extraer contenido legible del email recibido."}
        </pre>
      )}
    </div>
  );
}
