"use client";

type StepState = "pending" | "active" | "completed";

export type ProcesoEnvioStep = {
  id: string;
  label: string;
  state: StepState;
};

type Props = {
  open: boolean;
  title: string;
  steps: ProcesoEnvioStep[];
  statusText: string;
  error: string | null;
  canClose: boolean;
  onClose: () => void;
};

function StepIndicator({ state }: { state: StepState }) {
  if (state === "completed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
        ✓
      </span>
    );
  }

  if (state === "active") {
    return <span className="h-6 w-6 animate-pulse rounded-full bg-blue-600/20 ring-2 ring-blue-600" />;
  }

  return <span className="h-6 w-6 rounded-full border border-slate-300 bg-white" />;
}

export default function ProcesoEnvioModal({
  open,
  title,
  steps,
  statusText,
  error,
  canClose,
  onClose,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">El proceso se ejecuta en segundo plano y bloquea nuevos envios hasta completarse.</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                step.state === "active"
                  ? "border-blue-200 bg-blue-50"
                  : step.state === "completed"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <StepIndicator state={step.state} />
              <span
                className={`text-sm ${
                  step.state === "active"
                    ? "font-medium text-blue-800"
                    : step.state === "completed"
                      ? "font-medium text-emerald-800"
                      : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {error ? (
            <p className="font-medium text-red-700">{error}</p>
          ) : (
            <p>{statusText}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {canClose ? "Cerrar" : "Procesando..."}
          </button>
        </div>
      </div>
    </div>
  );
}
