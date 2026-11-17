import ConfirmSubmitButton from "../../../../liquidaciones/_components/ConfirmSubmitButton";
import { formatDateTime } from "../../../shared";
import { MAX_NOTAS_RENDICION } from "../../../../../lib/cierre-confirmacion";
import { cancelarConfirmacionAction, guardarNotasAction, reabrirEjercicioAction } from "./actions";
import RendicionEnvio from "./RendicionEnvio";

export type VersionCierre = {
  version: number;
  estado: string;
  confirmadoAt: Date;
  confirmadoPor: string | null;
  huella: string;
  comprobantesAnexados: number;
  presentadaAt: Date | null;
  reabiertoAt: Date | null;
  reabiertoPor: string | null;
  motivoReapertura: string | null;
};

export type EnvioRendicion = {
  id: number;
  tipoEnvio: string;
  destinatario: string | null;
  estado: string;
  createdAt: Date;
};

type Props = {
  ejercicioId: number;
  consorcioId: number;
  numero: number;
  estado: string;
  esAdmin: boolean;
  notas: string | null;
  huella: string | null;
  bloqueantes: string[];
  aVerificar: string[];
  versiones: VersionCierre[];
  envios: EnvioRendicion[];
};

const boton = "rounded-lg px-4 py-2 text-sm font-medium transition";
const botonSecundario = `${boton} border border-slate-300 text-slate-700 hover:bg-slate-50`;
const area =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50";

function Ocultos({ ejercicioId, consorcioId }: { ejercicioId: number; consorcioId: number }) {
  return (
    <>
      <input type="hidden" name="ejercicioId" value={ejercicioId} />
      <input type="hidden" name="consorcioId" value={consorcioId} />
    </>
  );
}

export default function PanelCierre(props: Props) {
  const { ejercicioId, consorcioId, estado, esAdmin } = props;
  const vigente = props.versiones.find((v) => v.estado === "VIGENTE") ?? null;
  const abierto = estado === "ABIERTO";

  return (
    <section className="mb-6 space-y-4">
      {estado === "CERRANDO" ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Confirmación del cierre en curso.</p>
          <p className="mt-1">
            Se están generando la rendición y la hoja del libro; mientras tanto no se pueden modificar datos del
            ejercicio. Si pasaron más de 5 minutos, la confirmación se interrumpió y se puede cancelar.
          </p>
          {esAdmin ? (
            <form action={cancelarConfirmacionAction} className="mt-3">
              <Ocultos ejercicioId={ejercicioId} consorcioId={consorcioId} />
              <button type="submit" className={botonSecundario}>
                Cancelar confirmación interrumpida
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {estado === "CERRADO" && vigente ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="font-medium">
            Ejercicio cerrado · versión {vigente.version} confirmada el {formatDateTime(vigente.confirmadoAt)}
            {vigente.confirmadoPor ? ` por ${vigente.confirmadoPor}` : ""}.
          </p>
          <p className="mt-1">
            Esta pantalla muestra los resultados guardados en la confirmación. Los registros con fecha o período del
            ejercicio no se pueden modificar.{" "}
            {vigente.presentadaAt
              ? `Rendición enviada a los propietarios el ${formatDateTime(vigente.presentadaAt)}.`
              : "La rendición todavía no se envió a los propietarios."}
          </p>
        </div>
      ) : null}

      {abierto ? (
        <form action={guardarNotasAction} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Ocultos ejercicioId={ejercicioId} consorcioId={consorcioId} />
          <h2 className="text-lg font-semibold text-slate-900">Notas de la rendición</h2>
          <p className="mt-1 text-sm text-slate-500">
            Aclaraciones del administrador que se agregan al final de las notas de la rendición (por ejemplo, por qué no
            hay liquidaciones en los primeros meses o cómo se integra el fondo de reserva). Separá los párrafos con una
            línea en blanco.
          </p>
          <textarea
            name="notas"
            rows={6}
            maxLength={MAX_NOTAS_RENDICION}
            defaultValue={props.notas ?? ""}
            disabled={!esAdmin}
            className={area}
          />
          {esAdmin ? (
            <div className="mt-3 flex justify-end">
              <button type="submit" className={botonSecundario}>
                Guardar notas
              </button>
            </div>
          ) : null}
        </form>
      ) : props.notas ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Notas de la rendición</h2>
          <p className="mt-2 whitespace-pre-line">{props.notas}</p>
        </div>
      ) : null}

      {esAdmin && (abierto || (estado === "CERRADO" && vigente)) ? (
        <RendicionEnvio
          ejercicioId={ejercicioId}
          consorcioId={consorcioId}
          numero={props.numero}
          cerrado={!abierto}
          huella={props.huella}
          aVerificar={props.aVerificar}
          bloqueantes={props.bloqueantes}
          presentada={Boolean(vigente?.presentadaAt)}
        />
      ) : null}

      {estado === "CERRADO" && esAdmin && vigente ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Envíos de la versión {vigente.version}</h2>
            {props.envios.length === 0 ? <p className="mt-2 text-sm text-slate-500">Sin envíos todavía.</p> : null}
            {props.envios.length > 0 ? (
              <ul className="mt-4 max-h-56 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 text-xs">
                {props.envios.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 text-slate-600">
                    <span className="truncate">
                      {formatDateTime(e.createdAt)} · {e.tipoEnvio === "RENDICION_PRUEBA_ADMIN" ? "Prueba" : "Propietarios"} ·{" "}
                      {e.destinatario ?? "sin email"}
                    </span>
                    <span className={e.estado === "ENVIADO" ? "text-emerald-700" : "text-red-700"}>{e.estado}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <details className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <summary className="cursor-pointer text-lg font-semibold text-red-700">Reabrir el ejercicio</summary>
            <p className="mt-2 text-sm text-slate-600">
              Para corregir datos del ejercicio. La versión {vigente.version} se conserva como «reabierta» junto con el
              motivo. Al terminar, se vuelve a cerrar con «Cerrar el ejercicio y enviar a los propietarios» (versión {props.versiones.length + 1}).
              Si la rendición ya se envió, conviene informar a los propietarios la nueva versión.
            </p>
            <form action={reabrirEjercicioAction} className="mt-4 space-y-3">
              <Ocultos ejercicioId={ejercicioId} consorcioId={consorcioId} />
              <label className="block text-sm font-medium text-slate-700">
                Motivo
                <textarea name="motivo" rows={3} required minLength={10} className={area} />
              </label>
              <div className="flex justify-end">
                <ConfirmSubmitButton
                  className={`${boton} border border-red-300 text-red-700 hover:bg-red-50`}
                  label="Reabrir ejercicio"
                  confirmMessage={`¿Reabrir el ejercicio N.º ${props.numero}? Los datos vuelven a ser editables hasta la nueva confirmación.`}
                />
              </div>
            </form>
          </details>
        </div>
      ) : null}

      {props.versiones.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Versiones del cierre</h2>
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Versión</th>
                <th className="py-2 pr-4 font-medium">Confirmada</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 pr-4 font-medium">Documentos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {props.versiones.map((v) => (
                <tr key={v.version} className="align-top">
                  <td className="py-2.5 pr-4 text-slate-700">
                    N.º {v.version}
                    <span className="block text-xs text-slate-400" title={v.huella}>
                      {v.huella.slice(0, 12)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">
                    {formatDateTime(v.confirmadoAt)}
                    {v.confirmadoPor ? <span className="block text-xs text-slate-500">{v.confirmadoPor}</span> : null}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">
                    {v.estado === "VIGENTE" ? (
                      <span className="text-emerald-700">Vigente</span>
                    ) : (
                      <>
                        <span className="text-amber-700">Reabierta</span>
                        {v.reabiertoAt ? (
                          <span className="block text-xs text-slate-500">
                            {formatDateTime(v.reabiertoAt)}
                            {v.reabiertoPor ? ` · ${v.reabiertoPor}` : ""}
                          </span>
                        ) : null}
                        {v.motivoReapertura ? (
                          <span className="block text-xs text-slate-500">Motivo: {v.motivoReapertura}</span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <a
                      href={`/api/ejercicios/${ejercicioId}/rendicion?version=${v.version}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-700 underline-offset-2 hover:underline"
                    >
                      Rendición
                    </a>
                    {" · "}
                    <a
                      href={`/api/ejercicios/${ejercicioId}/libro-administracion?version=${v.version}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-700 underline-offset-2 hover:underline"
                    >
                      Hoja del libro
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
