"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type JobStatus = "PENDING" | "RUNNING" | "VALIDATING" | "COMPLETED" | "FAILED";
type JobStage =
  | "PREPARING"
  | "GENERATING_RENDICION"
  | "GENERATING_BOLETAS"
  | "VERIFYING_FILES"
  | "ACTIVATING_FILES"
  | "DONE";

type JobPayload = {
  id: number;
  status: JobStatus;
  stage: JobStage;
  expectedFiles: number;
  generatedFiles: number;
  validatedFiles: number;
  message: string;
  errorDetail: string | null;
};

type JobStatusResponse = {
  ok: true;
  job: JobPayload;
  shouldRun?: boolean;
};

const STAGE_LABELS: Record<JobStage, string> = {
  PREPARING: "Preparando datos historicos...",
  GENERATING_RENDICION: "Generando rendicion PDF...",
  GENERATING_BOLETAS: "Generando boletas PDF...",
  VERIFYING_FILES: "Validando archivos...",
  ACTIVATING_FILES: "Activando archivos nuevos...",
  DONE: "Finalizado",
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    const reason = payload?.reason ?? "Error inesperado";
    throw new Error(String(reason));
  }

  return payload as T;
}

type Props = {
  liquidacionId: number;
  endpoint?: string;
  label?: string;
  confirmMessage?: string;
  modalTitle?: string;
  successMessage?: string;
  className?: string;
  completeAction?: "refresh" | "none";
  payloadFromFormId?: string;
  payloadFieldNames?: string[];
};

function readPayloadFromForm(formId: string, fieldNames?: string[]) {
  const form = document.getElementById(formId) as HTMLFormElement | null;
  if (!form) {
    return {} as Record<string, string>;
  }

  const data = new FormData(form);
  const payload: Record<string, string> = {};

  const names = fieldNames && fieldNames.length > 0 ? fieldNames : Array.from(data.keys());

  for (const name of names) {
    const value = data.get(name);
    if (typeof value === "string") {
      payload[name] = value;
    }
  }

  return payload;
}

export default function RegenerarArchivosButton({
  liquidacionId,
  endpoint,
  label = "Regenerar archivos",
  confirmMessage = "Esto eliminara los archivos PDF generados actualmente y los volvera a generar con el formato vigente. No modificara los importes ni los datos de la liquidacion.",
  modalTitle = "Regenerando archivos de liquidacion",
  successMessage = "Archivos regenerados correctamente.",
  className = "text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60",
  completeAction = "refresh",
  payloadFromFormId,
  payloadFieldNames,
}: Props) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [job, setJob] = useState<JobPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRequestInFlightRef = useRef(false);

  const isFinished = job?.status === "COMPLETED" || job?.status === "FAILED";

  function triggerJobRun(jobId: number) {
    if (runRequestInFlightRef.current) {
      return;
    }

    runRequestInFlightRef.current = true;

    void fetch(`/api/liquidaciones/regeneracion-jobs/${jobId}/run`, {
      method: "POST",
    })
      .catch((runError) => {
        console.error("[liquidacion-job] run request failed", runError);
      })
      .finally(() => {
        runRequestInFlightRef.current = false;
      });
  }

  useEffect(() => {
    if (!job || isFinished) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const payload = await fetchJson<JobStatusResponse>(
          `/api/liquidaciones/regeneracion-jobs/${job.id}`,
        );
        setJob(payload.job);
        if (payload.shouldRun) {
          triggerJobRun(payload.job.id);
        }
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "No se pudo consultar el estado del proceso");
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [job, isFinished]);

  const progressText = useMemo(() => {
    if (!job) return "";
    return `${job.generatedFiles}/${job.expectedFiles || 0} generados - ${job.validatedFiles}/${job.expectedFiles || 0} validados`;
  }, [job]);

  async function onStart() {
    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) {
      return;
    }

    setIsStarting(true);
    setError(null);
    setIsOpen(true);

    try {
      const extraPayload = payloadFromFormId
        ? readPayloadFromForm(payloadFromFormId, payloadFieldNames)
        : {};

      const payload = await fetchJson<{ ok: true; jobId: number }>(
        endpoint ?? `/api/liquidaciones/${liquidacionId}/regenerar-archivos`,
        {
          method: "POST",
          body: JSON.stringify(extraPayload),
        },
      );

      const firstStatus = await fetchJson<JobStatusResponse>(
        `/api/liquidaciones/regeneracion-jobs/${payload.jobId}`,
      );

      setJob(firstStatus.job);
      if (firstStatus.shouldRun || firstStatus.job.status === "PENDING") {
        triggerJobRun(firstStatus.job.id);
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "No se pudo iniciar la regeneracion");
    } finally {
      setIsStarting(false);
    }
  }

  function closeModal() {
    setIsOpen(false);
    if (job?.status === "COMPLETED" && completeAction === "refresh") {
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onStart}
        disabled={isStarting}
        className={className}
      >
        {isStarting ? "Iniciando..." : label}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">{modalTitle}</h3>

            {error ? (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            {job ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-medium">Estado:</span> {job.status}
                </p>
                <p>
                  <span className="font-medium">Etapa:</span> {STAGE_LABELS[job.stage] ?? job.stage}
                </p>
                <p>
                  <span className="font-medium">Detalle:</span> {job.message || STAGE_LABELS[job.stage]}
                </p>
                <p>
                  <span className="font-medium">Archivos:</span> {progressText}
                </p>
                {job.status === "FAILED" && job.errorDetail ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{job.errorDetail}</p>
                ) : null}
                {job.status === "COMPLETED" ? (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                    {successMessage}
                  </p>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600" />
                    <span>Proceso en ejecucion...</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">Preparando inicio del proceso...</p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {isFinished ? "Cerrar" : "Ocultar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
