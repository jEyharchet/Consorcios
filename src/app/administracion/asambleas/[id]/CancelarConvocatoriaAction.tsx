"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import ProcesoEnvioModal, { type ProcesoEnvioStep } from "./ProcesoEnvioModal";

type ActionResult =
  | { ok: true; successMessage: string }
  | { ok: false; errorMessage: string };

type Props = {
  asambleaId: number;
  consorcioId: number;
  cancelarConvocatoria: (formData: FormData) => Promise<ActionResult>;
};

const STEPS: ProcesoEnvioStep[] = [
  { id: "compose", label: "Preparando cancelacion", state: "pending" },
  { id: "pdf", label: "Generando PDF formal", state: "pending" },
  { id: "send", label: "Enviando cancelacion", state: "pending" },
  { id: "done", label: "Cancelacion completada", state: "pending" },
];

const ACTIVE_STATUS_TEXT: Record<string, string> = {
  compose: "Preparando la comunicacion institucional de cancelacion...",
  pdf: "Generando el PDF formal de cancelacion...",
  send: "Enviando la cancelacion a los destinatarios vigentes...",
  done: "Cancelacion realizada correctamente.",
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function CancelarConvocatoriaAction({
  asambleaId,
  consorcioId,
  cancelarConvocatoria,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [statusText, setStatusText] = useState("Preparando cancelacion...");
  const [progressError, setProgressError] = useState<string | null>(null);
  const [canClose, setCanClose] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const steps = STEPS.map((step, index) => ({
    ...step,
    state:
      progressError && index === currentStepIndex
        ? "active"
        : index < currentStepIndex
          ? "completed"
          : index === currentStepIndex
            ? "active"
            : "pending",
  })) satisfies ProcesoEnvioStep[];

  function closeProgressModal() {
    if (!canClose) {
      return;
    }

    setProgressOpen(false);
    setProgressError(null);
    setCanClose(false);
    setCurrentStepIndex(0);
    setStatusText("Preparando cancelacion...");
  }

  async function runCancelacion() {
    const trimmedMessage = mensaje.trim();

    if (!trimmedMessage) {
      setValidationError("Debes ingresar un mensaje para informar la cancelacion.");
      return;
    }

    setOpen(false);
    setValidationError(null);
    setProgressOpen(true);
    setCurrentStepIndex(0);
    setStatusText(ACTIVE_STATUS_TEXT.compose);
    setProgressError(null);
    setCanClose(false);

    await wait(300);
    setCurrentStepIndex(1);
    setStatusText(ACTIVE_STATUS_TEXT.pdf);

    await wait(300);
    setCurrentStepIndex(2);
    setStatusText(ACTIVE_STATUS_TEXT.send);

    const formData = new FormData();
    formData.set("id", String(asambleaId));
    formData.set("consorcioId", String(consorcioId));
    formData.set("mensajePersonalizado", trimmedMessage);

    const result = await cancelarConvocatoria(formData);

    if (!result.ok) {
      setProgressError(result.errorMessage);
      setCanClose(true);
      return;
    }

    setCurrentStepIndex(3);
    setStatusText(result.successMessage);

    closeTimeoutRef.current = window.setTimeout(() => {
      setProgressOpen(false);
      setProgressError(null);
      setCanClose(false);
      setCurrentStepIndex(0);
      setStatusText("Preparando cancelacion...");
      setMensaje("");
      router.refresh();
    }, 1200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValidationError(null);
          setOpen(true);
        }}
        disabled={isPending || progressOpen}
        className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Cancelar convocatoria
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Cancelar convocatoria</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Esta accion notificara por email a los destinatarios vigentes de la convocatoria y dejara la
                  asamblea en estado cancelada.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              La convocatoria sera cancelada formalmente y se enviara una comunicacion institucional con PDF adjunto.
            </div>

            <div className="mt-5 space-y-2">
              <label htmlFor="mensaje-cancelacion" className="text-sm font-medium text-slate-700">
                Mensaje personalizado
              </label>
              <textarea
                id="mensaje-cancelacion"
                rows={6}
                value={mensaje}
                onChange={(event) => {
                  setMensaje(event.target.value);
                  if (validationError) {
                    setValidationError(null);
                  }
                }}
                placeholder="Explica brevemente la cancelacion para los destinatarios."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-red-500 focus:ring-2"
              />
            </div>

            {validationError ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {validationError}
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  startTransition(() => {
                    void runCancelacion();
                  });
                }}
                disabled={isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirmar cancelacion
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ProcesoEnvioModal
        open={progressOpen}
        title="Cancelando convocatoria"
        steps={steps}
        statusText={statusText}
        error={progressError}
        canClose={canClose}
        onClose={closeProgressModal}
      />
    </>
  );
}
