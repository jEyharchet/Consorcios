"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import RespuestaRichComposer from "./RespuestaRichComposer";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {pending ? "Enviando..." : "Enviar"}
    </button>
  );
}

export default function RespuestaReplySection({
  receivedBody,
  latestReplyText,
  respuestaId,
  sendAction,
}: {
  receivedBody: string;
  latestReplyText: string;
  respuestaId: number;
  sendAction: (formData: FormData) => void | Promise<void>;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [draftHtml, setDraftHtml] = useState("");
  const [draftText, setDraftText] = useState("");
  const [composerKey, setComposerKey] = useState(0);

  useEffect(() => {
    const onStartReply = () => {
      setIsReplying(true);
      setComposerKey((current) => current + 1);
      setDraftHtml("");
      setDraftText("");
    };

    window.addEventListener("amiconsorcio:reply-start", onStartReply);
    return () => window.removeEventListener("amiconsorcio:reply-start", onStartReply);
  }, []);

  const handleCancel = () => {
    setIsReplying(false);
    setComposerKey((current) => current + 1);
    setDraftHtml("");
    setDraftText("");
  };

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Contenido</h3>
        {isReplying ? (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Respondiendo</span>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        ) : null}
      </div>

      {isReplying ? (
        <div className="mt-3 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ultima respuesta recibida</p>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
              {latestReplyText || "No se pudo aislar un mensaje util sin historial citado."}
            </pre>
          </div>

          <form action={sendAction} className="space-y-3">
            <input type="hidden" name="respuestaId" value={respuestaId} />
            <input type="hidden" name="bodyHtml" value={draftHtml} />
            <input type="hidden" name="bodyText" value={draftText} />

            <RespuestaRichComposer
              key={composerKey}
              active
              onChange={(value) => {
                setDraftHtml(value.html);
                setDraftText(value.text);
              }}
            />

            <div className="flex items-center justify-end gap-3">
              <SubmitButton disabled={draftText.trim().length === 0} />
            </div>
          </form>
        </div>
      ) : (
        <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
          {receivedBody || "No se pudo extraer contenido legible del email recibido."}
        </pre>
      )}
    </div>
  );
}
