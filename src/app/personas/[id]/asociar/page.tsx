import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "../../../../../lib/prisma";
import { createUnidadPersonaWithSequenceRecovery, overlaps, validateNoOverlap } from "../../../../lib/relaciones";
import AsociarUnidadForm from "./AsociarUnidadForm";

export default async function AsociarPersonaUnidadPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    consorcioId?: string;
    desde?: string;
    hasta?: string;
    confirmado?: string;
    error?: string;
  };
}) {
  const personaId = Number(params.id);
  const consorcioIdParam = searchParams?.consorcioId?.trim() ?? "";
  const desdeParam = searchParams?.desde?.trim() ?? "";
  const hastaParam = searchParams?.hasta?.trim() ?? "";
  const confirmado = searchParams?.confirmado === "1";

  const consorcioId = consorcioIdParam ? Number(consorcioIdParam) : null;
  const desde = desdeParam ? new Date(desdeParam) : null;
  const hasta = hastaParam ? new Date(hastaParam) : null;

  const errorMessage =
    searchParams?.error === "solape"
      ? "Ya existe una relación para esa persona y unidad que se superpone con el rango de fechas."
      : null;

  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
    select: { id: true, nombre: true, apellido: true },
  });

  if (!persona) {
    return <div className="p-6">Persona no encontrada</div>;
  }

  const consorcios = await prisma.consorcio.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  let unidades: { id: number; identificador: string; tipo: string }[] = [];

  if (confirmado && consorcioId && desde) {
    const [unidadesConsorcio, relacionesPersona] = await Promise.all([
      prisma.unidad.findMany({
        where: { consorcioId },
        orderBy: { identificador: "asc" },
        select: { id: true, identificador: true, tipo: true },
      }),
      prisma.unidadPersona.findMany({
        where: {
          personaId,
          unidad: { consorcioId },
        },
        select: { unidadId: true, desde: true, hasta: true },
      }),
    ]);

    unidades = unidadesConsorcio.filter((unidad) => {
      const relacionesUnidad = relacionesPersona.filter((rel) => rel.unidadId === unidad.id);

      return !relacionesUnidad.some((rel) => overlaps(rel.desde, rel.hasta, desde, hasta));
    });
  }

  async function asociar(formData: FormData) {
    "use server";

    const unidadId = Number(formData.get("unidadId"));
    const consorcioId = (formData.get("consorcioId")?.toString() ?? "").trim();
    const desde = (formData.get("desde")?.toString() ?? "").trim();
    const hasta = (formData.get("hasta")?.toString() ?? "").trim();

    const qs = new URLSearchParams();
    if (consorcioId) qs.set("consorcioId", consorcioId);
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    qs.set("confirmado", "1");

    if (!desde || !unidadId) {
      const query = qs.toString();
      redirect(`/personas/${personaId}/asociar${query ? `?${query}` : ""}`);
    }

    const nuevoDesde = new Date(desde);
    const nuevoHasta = hasta ? new Date(hasta) : null;

    const existentes = await prisma.unidadPersona.findMany({
      where: {
        unidadId,
        personaId,
      },
      select: {
        desde: true,
        hasta: true,
      },
    });

    const validacion = validateNoOverlap(existentes, {
      desde: nuevoDesde,
      hasta: nuevoHasta,
    });

    if (!validacion.ok) {
      qs.set("error", "solape");
      const query = qs.toString();
      redirect(`/personas/${personaId}/asociar${query ? `?${query}` : ""}`);
    }

    try {
      await createUnidadPersonaWithSequenceRecovery(prisma, {
        unidadId,
        personaId,
        desde: nuevoDesde,
        hasta: nuevoHasta,
      });
    } catch {
      qs.set("error", "solape");
      const query = qs.toString();
      redirect(`/personas/${personaId}/asociar${query ? `?${query}` : ""}`);
    }

    redirect(`/personas/${personaId}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/personas/${personaId}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Asociar a unidad</h1>
      </header>

      <AsociarUnidadForm
        personaLabel={`${persona.apellido}, ${persona.nombre}`}
        consorcios={consorcios}
        unidades={unidades}
        initial={{
          consorcioId: consorcioIdParam,
          desde: desdeParam,
          hasta: hastaParam,
          confirmado,
        }}
        errorMessage={errorMessage}
        onGuardar={asociar}
      />
    </main>
  );
}
