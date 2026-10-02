export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(init?.headers)),
    },
  });

  if (response.redirected && new URL(response.url).pathname === "/login") {
    throw new Error("La sesion vencio. Inicia sesion nuevamente para continuar.");
  }

  const body = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(
      `El servidor devolvio una respuesta ${body.trim() ? "invalida" : "vacia"} (HTTP ${response.status}). No se pudo confirmar el estado del proceso.`,
    );
  }

  if (!response.ok) {
    const reason = payload && typeof payload === "object" && "reason" in payload
      ? String(payload.reason)
      : `No se pudo completar la solicitud (HTTP ${response.status}).`;
    throw new Error(reason);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("El servidor devolvio una respuesta invalida. No se pudo confirmar el estado del proceso.");
  }
  return payload as T;
}
