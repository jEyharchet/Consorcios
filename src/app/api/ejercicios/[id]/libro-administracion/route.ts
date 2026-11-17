import { responderPdfEjercicio } from "@/lib/ejercicio-pdf-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hoja de cierre del ejercicio para el Libro de Administración.
// Ejercicio cerrado o ?version=N: la versión confirmada guardada. Abierto: borrador
// generado al momento desde la simulación (solo lectura).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return responderPdfEjercicio(req, params.id, "libro");
}
