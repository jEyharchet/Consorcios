import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

export function isLiquidacionJobIdCollision(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const { modelName, target } = error.meta ?? {};
  return modelName === "LiquidacionRegeneracionJob" && (
    (Array.isArray(target) && target.length === 1 && target[0] === "id") ||
    target === "LiquidacionRegeneracionJob_pkey"
  );
}

export async function createLiquidacionJob(
  data: Prisma.LiquidacionRegeneracionJobCreateInput,
  db: typeof prisma = prisma,
) {
  const create = () => db.liquidacionRegeneracionJob.create({ data, select: { id: true } });
  try {
    return await create();
  } catch (error) {
    if (!isLiquidacionJobIdCollision(error)) throw error;

    console.warn("[liquidacion-job] realigning LiquidacionRegeneracionJob id sequence");
    // The failed insert must finish before repairing the sequence in a new transaction.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "LiquidacionRegeneracionJob" IN SHARE ROW EXCLUSIVE MODE`;
      await tx.$queryRaw`
        SELECT setval(
          pg_get_serial_sequence('"LiquidacionRegeneracionJob"', 'id'),
          GREATEST(
            COALESCE((SELECT MAX(id)::bigint + 1 FROM "LiquidacionRegeneracionJob"), 1),
            nextval(pg_get_serial_sequence('"LiquidacionRegeneracionJob"', 'id'))
          ),
          false
        )
      `;
    });
    // Retry once; other failures must remain visible to the caller.
    return create();
  }
}
