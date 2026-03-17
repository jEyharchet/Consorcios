"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import ProcesoEnvioModal, { type ProcesoEnvioStep } from "./ProcesoEnvioModal";

type ActionSuccess = {
  ok: true;
  successMessage: string;
};

type ActionFailure = {
  ok: false;
  errorMessage: string;
};

type ActionResult = ActionSuccess | ActionFailure;

type Props = {
  asambleaId: number;
  consorcioId: number;
  enviarConvocatoria: (formData: FormData) => Promise<ActionResult>;
  enviarSimulacion: (formData: FormData) => Promise<ActionResult>;
};

type FlowKind = "simulacion" | "convocatoria";

type StepConfig = {
  id: string;
  label: string;
};

const STEP_CONFIGS: Record<FlowKind, StepConfig[]> = {
  simulacion: [
    { id: "compose", label: "Generando comunicacion" },
    { id: "pdf", label: "Generando el PDF" },
    { id: "send", label: "Enviando la simulacion" },
    { id: "done", label: "Envio realizado correctamente" },
  ],
  convocatoria: [
    { id: "compose", label: "Generando comunicacion" },
    { id: "send", label: "Enviando la convocatoria" },
    { id: "done", label: "Envio realizado correctamente" },
  ],
};

const ACTIVE_STATUS_TEXT: Record<string, string> = {
  compose: "Preparando el contenido de la convocatoria...",
  pdf: "Generando el PDF adjunto para revision...",
  send: "Enviando la convocatoria por email...",
  done: "Envio realizado correctamente.",
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function ConvocatoriaActions({
  asambleaId,
  consorcioId,
  enviarConvocatoria,
  enviarSimulacion,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [flow, setFlow] = useState<FlowKind | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [statusText, setStatusText] = useState("Preparando envio...");
  const [error, setError] = useState<string | null>(null);
  const [canClose, setCanClose] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const steps = useMemo<ProcesoEnvioStep[]>(() => {
    const config = flow ? STEP_CONFIGS[flow] : [];

    return config.map((step, index) => ({
      ...step,
      state:
        error && index === currentStepIndex
          ? "active"
          : index < currentStepIndex
            ? "completed"
            : index === currentStepIndex
              ? "active"
              : "pending",
    }));
  }, [currentStepIndex, error, flow]);

  function closeModal() {
    if (!canClose) {
      return;
    }

    setFlow(null);
    setError(null);
    setCanClose(false);
    setCurrentStepIndex(0);
    setStatusText("Preparando envio...");
  }

  async function runFlow(kind: FlowKind) {
    const config = STEP_CONFIGS[kind];
    const formData = new FormData();
    formData.set("id", String(asambleaId));
    formData.set("consorcioId", String(consorcioId));

    setFlow(kind);
    setCurrentStepIndex(0);
    setError(null);
    setCanClose(false);
    setStatusText(ACTIVE_STATUS_TEXT[config[0].id] ?? "Preparando envio...");

    for (let index = 1; index < config.length - 1; index += 1) {
      await wait(350);
      setCurrentStepIndex(index);
      setStatusText(ACTIVE_STATUS_TEXT[config[index].id] ?? "Procesando...");
    }

    const result = await (kind === "simulacion" ? enviarSimulacion(formData) : enviarConvocatoria(formData));

    if (!result.ok) {
      setError(result.errorMessage);
      setCanClose(true);
      return;
    }

    const lastIndex = config.length - 1;
    setCurrentStepIndex(lastIndex);
    setStatusText(result.successMessage);
    setCanClose(false);

    closeTimeoutRef.current = window.setTimeout(() => {
      setFlow(null);
      setError(null);
      setCanClose(false);
      setCurrentStepIndex(0);
      setStatusText("Preparando envio...");
      router.refresh();
    }, 1200);
  }

  function handleStart(kind: FlowKind) {
    if (isPending || flow) {
      return;
    }

    startTransition(() => {
      void runFlow(kind);
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleStart("simulacion")}
          disabled={isPending || Boolean(flow)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Enviar simulacion al administrador
        </button>

        <button
          type="button"
          onClick={() => handleStart("convocatoria")}
          disabled={isPending || Boolean(flow)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Enviar convocatoria
        </button>
      </div>

      <ProcesoEnvioModal
        open={Boolean(flow)}
        title={flow === "simulacion" ? "Enviando simulacion de convocatoria" : "Enviando convocatoria"}
        steps={steps}
        statusText={statusText}
        error={error}
        canClose={canClose}
        onClose={closeModal}
      />
    </>
  );
}
