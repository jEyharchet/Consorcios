import type { PrismaClient } from "@prisma/client";

export type DateRange = {
  desde: Date;
  hasta: Date | null;
};

export function normalizeDate(d: Date): Date {
  const normalized = new Date(d);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function isVigente(desde: Date, hasta: Date | null, refDate = new Date()): boolean {
  const start = normalizeDate(desde);
  const end = hasta ? normalizeDate(hasta) : null;
  const ref = normalizeDate(refDate);

  return start <= ref && (end === null || end >= ref);
}

export function formatDateAR(d: Date | null): string {
  if (!d) return "-";

  const day = `${d.getDate()}`.padStart(2, "0");
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

export function overlaps(
  desdeA: Date,
  hastaA: Date | null,
  desdeB: Date,
  hastaB: Date | null,
): boolean {
  const startA = normalizeDate(desdeA);
  const endA = hastaA ? normalizeDate(hastaA) : null;
  const startB = normalizeDate(desdeB);
  const endB = hastaB ? normalizeDate(hastaB) : null;

  const aStartsBeforeBEnds = endB === null || startA <= endB;
  const aEndsAfterBStarts = endA === null || endA >= startB;

  return aStartsBeforeBEnds && aEndsAfterBStarts;
}

export function validateNoOverlap(
  existing: DateRange[],
  nuevo: DateRange,
): { ok: true } | { ok: false; message: string } {
  const hasOverlap = existing.some((range) => overlaps(range.desde, range.hasta, nuevo.desde, nuevo.hasta));

  if (hasOverlap) {
    return { ok: false, message: "La relacion se solapa con otra existente" };
  }

  return { ok: true };
}

type OverlapParams = {
  prisma: PrismaClient;
  unidadId: number;
  personaId: number;
  desde: Date;
  hasta: Date | null;
};

export async function hasUnidadPersonaOverlap({
  prisma,
  unidadId,
  personaId,
  desde,
  hasta,
}: OverlapParams): Promise<boolean> {
  const overlap = await prisma.unidadPersona.findFirst({
    where: {
      unidadId,
      personaId,
      AND: [
        ...(hasta ? [{ desde: { lte: hasta } }] : []),
        { OR: [{ hasta: null }, { hasta: { gte: desde } }] },
      ],
    },
    select: { id: true },
  });

  return Boolean(overlap);
}
