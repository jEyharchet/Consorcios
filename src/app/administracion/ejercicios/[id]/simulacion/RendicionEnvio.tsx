"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import ProcesoEnvioModal, { type ProcesoEnvioStep } from "../../../asambleas/[id]/ProcesoEnvioModal";
import {
  cerrarYEnviarRendicionAction,
  enviarPruebaRendicionAction,
  reenviarRendicionAction,
  type ResultadoEnvio,
} from "./actions";

type Flujo = "prueba" | "cerrar" | "reenviar";

const PASOS: Record<Flujo, Array<{ id: string; label: string; texto: string }>> = {
  prueba: [
    { id: "pdf", label: "Generando la rendición y el anexo de comprobantes", texto: "Generando el PDF de la rendición..." },
    { id: "send", label: "Enviando la prueba a la administración", texto: "Enviando el email de prueba..." },
    { id: "done", label: "Envío realizado", texto: "Listo." },
  ],
  cerrar: [
    { id: "check", label: "Verificando los datos del ejercicio", texto: "Recalculando la simulación..." },
    { id: "pdf", label: "Generando la rendición, el anexo y la hoja del libro", texto: "Generando los documentos..." },
    { id: "close", label: "Confirmando el cierre", texto: "Guardando la versión del cierre..." },
    { id: "send", label: "Enviando la rendición a los propietarios", texto: "Enviando los emails..." },
    { id: "done", label: "Cierre y envío realizados", texto: "Listo." },
  ],
  reenviar: [
    { id: "pdf", label: "Adjuntando la rendición confirmada", texto: "Preparando el adjunto..." },
    { id: "send", label: "Enviando la rendición a los propietarios", texto: "Enviando los emails..." },
    { id: "done", label: "Envío realizado", texto: "Listo." },
  ],
};

const TITULOS: Record<Flujo, string> = {
  prueba: "Enviando prueba de la rendición",
  cerrar: "Cerrando el ejercicio y enviando la rendición",
  reenviar: "Reenviando la rendición",
};

type Props = {
  ejercicioId: number;
  consorcioId: number;
  numero: number;
  cerrado: boolean;
  /** Abierto: huella de la simulación revisada; null si no se puede cerrar. */
  huella: string | null;
  aVerificar: string[];
  bloqueantes: string[];
  presentada: boolean;
};

const boton = "rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

function esperar(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function RendicionEnvio(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [flujo, setFlujo] = useState<Flujo | null>(null);
  const [paso, setPaso] = useState(0);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [puedeCerrar, setPuedeCerrar] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const timeout = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeout.current) window.clearTimeout(timeout.current);
  }, []);

  const pasos = useMemo<ProcesoEnvioStep[]>(
    () =>
      (flujo ? PASOS[flujo] : []).map((p, i) => ({
        id: p.id,
        label: p.label,
        state: i < paso ? "completed" : i === paso ? "active" : "pending",
      })),
    [flujo, paso],
  );

  async function correr(tipo: Flujo) {
    const config = PASOS[tipo];
    const datos = new FormData();
    datos.set("ejercicioId", String(props.ejercicioId));
    datos.set("consorcioId", String(props.consorcioId));
    datos.set("mensaje", mensaje);
    if (tipo === "cerrar") {
      datos.set("huella", props.huella ?? "");
      datos.set("aceptaObservaciones", acepta ? "1" : "0");
    }

    setFlujo(tipo);
    setPaso(0);
    setError(null);
    setPuedeCerrar(false);
    setTexto(config[0].texto);

    // Los pasos intermedios avanzan mientras el servidor trabaja (como en las convocatorias).
    const accion: Promise<ResultadoEnvio> =
      tipo === "prueba"
        ? enviarPruebaRendicionAction(datos)
        : tipo === "cerrar"
          ? cerrarYEnviarRendicionAction(datos)
          : reenviarRendicionAction(datos);
    let terminado = false;
    void accion.finally(() => {
      terminado = true;
    });
    for (let i = 1; i < config.length - 1 && !terminado; i++) {
      await esperar(tipo === "cerrar" ? 2500 : 1500);
      if (terminado) break;
      setPaso(i);
      setTexto(config[i].texto);
    }

    const resultado = await accion;
    if (!resultado.ok) {
      setError(resultado.error);
      setPuedeCerrar(true);
      router.refresh();
      return;
    }

    setPaso(config.length - 1);
    setTexto(resultado.mensaje);
    timeout.current = window.setTimeout(() => {
      setFlujo(null);
      setAviso(resultado.mensaje);
      router.refresh();
    }, 1800);
  }

  function iniciar(tipo: Flujo) {
    if (isPending || flujo) return;
    if (tipo === "cerrar") {
      if (props.aVerificar.length > 0 && !acepta) {
        setAviso("Marcá que revisaste las observaciones a verificar.");
        return;
      }
      if (
        !window.confirm(
          `¿Cerrar el ejercicio N.º ${props.numero} y enviar la rendición a los propietarios? Los datos del ejercicio quedan bloqueados (se pueden reabrir con un motivo).`,
        )
      ) {
        return;
      }
    }
    if (tipo === "reenviar" && !window.confirm("¿Reenviar la rendición a todos los propietarios?")) return;
    setAviso(null);
    startTransition(() => {
      void correr(tipo);
    });
  }

  const ocupado = isPending || Boolean(flujo);
  const puedeCerrarEjercicio = !props.cerrado && props.bloqueantes.length === 0 && Boolean(props.huella);

  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        {props.cerrado ? "Envío de la rendición" : "Cierre y envío de la rendición"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {props.cerrado
          ? "El ejercicio está cerrado. Podés mandar una prueba a la administración o reenviar la rendición a los propietarios."
          : "Mandá primero una prueba a la administración (no cierra el ejercicio). Al enviar a los propietarios, el ejercicio se cierra: se guardan la rendición con el anexo de comprobantes y la hoja del libro, se bloquean los datos del ejercicio y la apertura del siguiente toma los saldos al cierre."}
      </p>

      {!props.cerrado && props.bloqueantes.length > 0 ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">Todavía no se puede cerrar:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {props.bloqueantes.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <textarea
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        rows={3}
        disabled={ocupado}
        placeholder="Mensaje opcional para el email (por ejemplo, la fecha de la asamblea en la que se trata)"
        className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
      />

      {puedeCerrarEjercicio && props.aVerificar.length > 0 ? (
        <label className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <input
            type="checkbox"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            disabled={ocupado}
            className="mt-0.5"
          />
          <span>Revisé las observaciones a verificar ({props.aVerificar.join("; ")}) y cierro el ejercicio igual.</span>
        </label>
      ) : null}

      {aviso ? <p className="mt-3 text-sm text-slate-700">{aviso}</p> : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => iniciar("prueba")}
          disabled={ocupado}
          className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-50`}
        >
          Enviar prueba a la administración
        </button>
        {props.cerrado ? (
          <button
            type="button"
            onClick={() => iniciar("reenviar")}
            disabled={ocupado}
            className={`${boton} bg-slate-900 text-white hover:bg-slate-800`}
          >
            {props.presentada ? "Reenviar a los propietarios" : "Enviar a los propietarios"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => iniciar("cerrar")}
            disabled={ocupado || !puedeCerrarEjercicio}
            className={`${boton} bg-slate-900 text-white hover:bg-slate-800`}
          >
            Cerrar el ejercicio y enviar a los propietarios
          </button>
        )}
      </div>

      <ProcesoEnvioModal
        open={Boolean(flujo)}
        title={flujo ? TITULOS[flujo] : ""}
        steps={pasos}
        statusText={texto}
        error={error}
        canClose={puedeCerrar}
        onClose={() => {
          if (!puedeCerrar) return;
          setFlujo(null);
          setError(null);
        }}
      />
    </div>
  );
}
