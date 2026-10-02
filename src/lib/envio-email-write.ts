import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

export function isEnvioEmailIdCollision(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const { modelName, target } = error.meta ?? {};
  return modelName === "EnvioEmail" && (
    (Array.isArray(target) && target.length === 1 && target[0] === "id") ||
    target === "EnvioEmail_pkey"
  );
}

export async function withEnvioEmailIdRecovery<T>(
  create: () => Promise<T>,
  db: typeof prisma = prisma,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (!isEnvioEmailIdCollision(error)) throw error;

    console.warn("[envio-email] realigning EnvioEmail id sequence");
    // The failed insert must finish before repairing the sequence in a new transaction.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "EnvioEmail" IN SHARE ROW EXCLUSIVE MODE`;
      await tx.$queryRaw`
        SELECT setval(
          pg_get_serial_sequence('"EnvioEmail"', 'id'),
          GREATEST(
            COALESCE((SELECT MAX(id)::bigint + 1 FROM "EnvioEmail"), 1),
            nextval(pg_get_serial_sequence('"EnvioEmail"', 'id'))
          ),
          false
        )
      `;
    });
    // Retry once; other failures must remain visible to the caller.
    return create();
  }
}
