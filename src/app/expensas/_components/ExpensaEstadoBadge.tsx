export type ExpensaEstadoVisual = "PAGADA" | "PENDIENTE" | "VENCIDA";

type ExpensaEstadoBadgeProps = {
  estado: ExpensaEstadoVisual;
};

const ESTADO_STYLES: Record<ExpensaEstadoVisual, string> = {
  PAGADA: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  PENDIENTE: "bg-amber-100 text-amber-800 ring-amber-600/20",
  VENCIDA: "bg-rose-100 text-rose-800 ring-rose-600/20",
};

const ESTADO_LABELS: Record<ExpensaEstadoVisual, string> = {
  PAGADA: "Pagada",
  PENDIENTE: "Pendiente",
  VENCIDA: "Vencida",
};

export default function ExpensaEstadoBadge({ estado }: ExpensaEstadoBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ESTADO_STYLES[estado]}`}
    >
      {ESTADO_LABELS[estado]}
    </span>
  );
}
