"use client";

import { useEffect, useRef, useState } from "react";

function ToolbarButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={onClick}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-slate-200 px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
    >
      {label}
    </button>
  );
}

type ComposerValue = {
  html: string;
  text: string;
};

export default function RespuestaRichComposer({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (value: ComposerValue) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (!active) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      editorRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [active]);

  const syncValue = () => {
    const nextHtml = editorRef.current?.innerHTML ?? "";
    const nextText = editorRef.current?.innerText?.replace(/\r/g, "").trim() ?? "";
    setHtml(nextHtml);
    onChange({
      html: nextHtml,
      text: nextText,
    });
  };

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncValue();
  };

  return (
    <div id="reply-editor" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <select
          aria-label="Estilo"
          title="Estilo"
          defaultValue="p"
          onChange={(event) => runCommand("formatBlock", event.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="p">Normal</option>
          <option value="h3">Titulo</option>
          <option value="h4">Subtitulo</option>
        </select>

        <ToolbarButton label="B" title="Negrita" onClick={() => runCommand("bold")} />
        <ToolbarButton label="I" title="Cursiva" onClick={() => runCommand("italic")} />
        <ToolbarButton label="U" title="Subrayado" onClick={() => runCommand("underline")} />

        <label className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-2 text-sm text-slate-700">
          <span>Color</span>
          <input
            type="color"
            aria-label="Color de texto"
            title="Color de texto"
            defaultValue="#0f172a"
            onChange={(event) => runCommand("foreColor", event.target.value)}
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>

        <ToolbarButton label="L" title="Alinear a la izquierda" onClick={() => runCommand("justifyLeft")} />
        <ToolbarButton label="C" title="Centrar" onClick={() => runCommand("justifyCenter")} />
        <ToolbarButton label="R" title="Alinear a la derecha" onClick={() => runCommand("justifyRight")} />
        <ToolbarButton label="UL" title="Lista con vinetas" onClick={() => runCommand("insertUnorderedList")} />
        <ToolbarButton label="1." title="Lista numerada" onClick={() => runCommand("insertOrderedList")} />
        <ToolbarButton label='""' title="Cita" onClick={() => runCommand("formatBlock", "blockquote")} />
        <ToolbarButton label="Tx" title="Limpiar formato" onClick={() => runCommand("removeFormat")} />
      </div>

      <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
        {active ? "Respondiendo. Redacta la respuesta a continuacion." : "Toca responder para entrar en modo respuesta y redactar desde aqui."}
      </div>

      <div className="relative min-h-[260px]">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncValue}
          className="relative z-10 min-h-[260px] px-4 py-4 text-sm leading-6 text-slate-800 outline-none"
        />

        {html.trim().length === 0 ? (
          <div className="pointer-events-none absolute inset-0 px-4 py-4 text-sm text-slate-400">Escribe tu respuesta...</div>
        ) : null}
      </div>
    </div>
  );
}
