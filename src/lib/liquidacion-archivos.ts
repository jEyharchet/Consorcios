import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type LiquidacionArchivoCreateInput = {
  tipoArchivo: string;
  nombreArchivo: string;
  rutaArchivo: string;
  mimeType?: string | null;
  responsableGroupKey?: string | null;
  activo?: boolean;
};

export function isLiquidacionArchivoIdCollision(error: unknown) {
  const target =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? (error.meta as { target?: unknown } | undefined)?.target
      : undefined;
  const targetIncludesId =
    (Array.isArray(target) && target.includes("id")) ||
    (typeof target === "string" && target.includes("id"));

  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    targetIncludesId
  );
}

export async function realignLiquidacionArchivoIdSequence(db: typeof prisma = prisma) {
  await db.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"LiquidacionArchivo"', 'id'),
      COALESCE((SELECT MAX(id) + 1 FROM "LiquidacionArchivo"), 1),
      false
    )
  `);
}

export async function createLiquidacionArchivos(
  db: DbClient,
  params: {
    liquidacionId: number;
    archivos: LiquidacionArchivoCreateInput[];
  },
) {
  const data = params.archivos.map((archivo) => ({
    liquidacionId: params.liquidacionId,
    tipoArchivo: archivo.tipoArchivo,
    nombreArchivo: archivo.nombreArchivo,
    rutaArchivo: archivo.rutaArchivo,
    mimeType: archivo.mimeType ?? "application/pdf",
    responsableGroupKey: archivo.responsableGroupKey ?? null,
    activo: archivo.activo ?? true,
  }));

  if (data.length === 0) {
    return;
  }

  const existingCount = await db.liquidacionArchivo.count({
    where: { liquidacionId: params.liquidacionId },
  });

  console.info("[liquidacion-archivo] createMany batch", {
    liquidacionId: params.liquidacionId,
    count: data.length,
    existingCount,
    includesId: data.some((item) => Object.prototype.hasOwnProperty.call(item, "id")),
    files: data.map((item) => ({
      tipoArchivo: item.tipoArchivo,
      nombreArchivo: item.nombreArchivo,
      responsableGroupKey: item.responsableGroupKey,
    })),
  });

  await db.liquidacionArchivo.createMany({ data });
}
