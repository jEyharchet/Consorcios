export function buildReturnQuery(values: Record<string, string | undefined | null>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

// Para momentos reales (createdAt, receivedAt, votadoAt...). Fija la hora de
// Argentina porque Vercel corre en UTC. No usar para fechas sin hora.
export function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
