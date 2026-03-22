"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
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

type ConvocatoriaResponsableOption = {
  key: string;
  personaId: number;
  unidadId: number;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  unidadLabel: string;
  email: string;
};

type Props = {
  asambleaId: number;
  consorcioId: number;
  destinatariosElegibles: ConvocatoriaResponsableOption[];
  enviarConvocatoria: (formData: FormData) => Promise<ActionResult>;
  enviarSimulacion: (formData: FormData) => Promise<ActionResult>;
};

type FlowKind = "simulacion" | "convocatoria";
type DecisionMode = "all" | "selected" | null;

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

function SelectionModal({
  open,
  mode,
  destinatariosElegibles,
  search,
  onSearchChange,
  selectedKeys,
  filteredDestinatarios,
  selectionError,
  isBusy,
  onClose,
  onModeChange,
  onToggleSelection,
  onConfirm,
}: {
  open: boolean;
  mode: DecisionMode;
  destinatariosElegibles: ConvocatoriaResponsableOption[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedKeys: string[];
  filteredDestinatarios: ConvocatoriaResponsableOption[];
  selectionError: string | null;
  isBusy: boolean;
  onClose: () => void;
  onModeChange: (mode: Exclude<DecisionMode, null>) => void;
  onToggleSelection: (key: string) => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  const selectedItems = destinatariosElegibles.filter((item) => selectedKeys.includes(item.key));
  const uniqueSelectedEmails = new Set(selectedItems.map((item) => item.email)).size;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Enviar convocatoria</h3>
            <p className="mt-1 text-sm text-slate-500">
              Elegi primero el alcance del envio antes de ejecutar la convocatoria real.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onModeChange("all")}
            disabled={isBusy}
            className={`rounded-2xl border p-5 text-left transition ${
              mode === "all" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Alcance</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-950">Enviar a todos</h4>
            <p className="mt-2 text-sm text-slate-600">
              Usa el flujo masivo actual y envía la convocatoria a todos los responsables vigentes del consorcio.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onModeChange("selected")}
            disabled={isBusy}
            className={`rounded-2xl border p-5 text-left transition ${
              mode === "selected" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Alcance</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-950">Elegir destinatarios</h4>
            <p className="mt-2 text-sm text-slate-600">
              Busca responsables por nombre, unidad o email, arma la lista y enviá solo a los seleccionados.
            </p>
          </button>
        </div>

        {mode === "all" ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              Se enviará a <span className="font-semibold">{destinatariosElegibles.length}</span> responsables elegibles,
              deduplicando emails repetidos en el procesamiento real.
            </p>
          </div>
        ) : null}

        {mode === "selected" ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label htmlFor="buscar-destinatarios" className="text-sm font-medium text-slate-700">
                Buscar responsables
              </label>
              <input
                id="buscar-destinatarios"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Buscar por nombre, unidad o email"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              />

              <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {destinatariosElegibles.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    No hay responsables elegibles con email válido para esta asamblea.
                  </p>
                ) : filteredDestinatarios.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    No hay resultados para esa búsqueda.
                  </p>
                ) : (
                  filteredDestinatarios.map((item) => {
                    const selected = selectedKeys.includes(item.key);

                    return (
                      <div
                        key={item.key}
                        className={`rounded-xl border px-4 py-3 ${
                          selected ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.nombreCompleto}</p>
                            <p className="mt-1 text-sm text-slate-600">{item.unidadLabel}</p>
                            <p className="mt-1 text-sm text-slate-500">{item.email}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => onToggleSelection(item.key)}
                            disabled={isBusy}
                            className={`rounded-md px-3 py-2 text-sm font-medium ${
                              selected
                                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                : "bg-slate-900 text-white hover:bg-slate-800"
                            }`}
                          >
                            {selected ? "Quitar" : "Agregar"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Seleccionados</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedItems.length} responsables, {uniqueSelectedEmails} emails únicos.
                  </p>
                </div>
              </div>

              <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {selectedItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                    Todavía no seleccionaste destinatarios.
                  </p>
                ) : (
                  selectedItems.map((item) => (
                    <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{item.nombreCompleto}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.unidadLabel}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.email}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {selectionError ? (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {selectionError}
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy || mode === null || (mode === "selected" && selectedItems.length === 0)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mode === "selected"
              ? `Confirmar envío a ${selectedItems.length} destinatarios`
              : "Confirmar envío a todos"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConvocatoriaActions({
  asambleaId,
  consorcioId,
  destinatariosElegibles,
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
  const [selectionModalOpen, setSelectionModalOpen] = useState(false);
  const [decisionMode, setDecisionMode] = useState<DecisionMode>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const closeTimeoutRef = useRef<number | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const filteredDestinatarios = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    if (!query) {
      return destinatariosElegibles;
    }

    return destinatariosElegibles.filter((item) =>
      [item.nombreCompleto, item.unidadLabel, item.email].some((field) => field.toLowerCase().includes(query)),
    );
  }, [deferredSearch, destinatariosElegibles]);

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

  function resetDecisionState() {
    setDecisionMode(null);
    setSelectionError(null);
    setSearch("");
    setSelectedKeys([]);
  }

  function closeProgressModal() {
    if (!canClose) {
      return;
    }

    setFlow(null);
    setError(null);
    setCanClose(false);
    setCurrentStepIndex(0);
    setStatusText("Preparando envio...");
  }

  function closeSelectionModal() {
    if (isPending || Boolean(flow)) {
      return;
    }

    setSelectionModalOpen(false);
    resetDecisionState();
  }

  async function runFlow(kind: FlowKind, formData?: FormData) {
    const config = STEP_CONFIGS[kind];
    const payload = formData ?? new FormData();

    payload.set("id", String(asambleaId));
    payload.set("consorcioId", String(consorcioId));

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

    const result = await (kind === "simulacion" ? enviarSimulacion(payload) : enviarConvocatoria(payload));

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

    if (kind === "convocatoria") {
      resetDecisionState();
      setSelectionModalOpen(true);
      setSelectionError(null);
      return;
    }

    startTransition(() => {
      void runFlow(kind);
    });
  }

  function toggleSelection(key: string) {
    setSelectionError(null);
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function confirmConvocatoriaDecision() {
    if (isPending || Boolean(flow) || decisionMode === null) {
      return;
    }

    if (decisionMode === "selected" && selectedKeys.length === 0) {
      setSelectionError("Debes seleccionar al menos un destinatario antes de enviar la convocatoria.");
      return;
    }

    const formData = new FormData();
    formData.set("alcance", decisionMode === "selected" ? "SELECTED" : "ALL");

    if (decisionMode === "selected") {
      for (const key of selectedKeys) {
        formData.append("selectedDestinatario", key);
      }
    }

    setSelectionModalOpen(false);
    setSelectionError(null);

    startTransition(() => {
      void runFlow("convocatoria", formData);
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleStart("simulacion")}
          disabled={isPending || Boolean(flow) || selectionModalOpen}
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

      <SelectionModal
        open={selectionModalOpen}
        mode={decisionMode}
        destinatariosElegibles={destinatariosElegibles}
        search={search}
        onSearchChange={setSearch}
        selectedKeys={selectedKeys}
        filteredDestinatarios={filteredDestinatarios}
        selectionError={selectionError}
        isBusy={isPending || Boolean(flow)}
        onClose={closeSelectionModal}
        onModeChange={(mode) => {
          setDecisionMode(mode);
          setSelectionError(null);
        }}
        onToggleSelection={toggleSelection}
        onConfirm={confirmConvocatoriaDecision}
      />

      <ProcesoEnvioModal
        open={Boolean(flow)}
        title={flow === "simulacion" ? "Enviando simulacion de convocatoria" : "Enviando convocatoria"}
        steps={steps}
        statusText={statusText}
        error={error}
        canClose={canClose}
        onClose={closeProgressModal}
      />
    </>
  );
}
