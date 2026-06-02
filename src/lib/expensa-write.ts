import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type ExpensaCreateInput = {
  liquidacionId: number;
  unidadId: number;
  monto: number;
  saldo: number;
  estado?: string;
};

function targetIncludesId(target: unknown) {
  return (
    (Array.isArray(target) && target.includes("id")) ||
    (typeof target === "string" && target.includes("id"))
  );
}

export function isExpensaIdCollision(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (error.meta as { modelName?: unknown } | undefined)?.modelName === "Expensa" &&
    targetIncludesId((error.meta as { target?: unknown } | undefined)?.target)
  );
}

export async function realignExpensaIdSequence(db: typeof prisma = prisma) {
  await db.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"Expensa"', 'id'),
      COALESCE((SELECT MAX(id) + 1 FROM "Expensa"), 1),
      false
    )
  `);
}

export async function createExpensas(
  db: DbClient,
  params: {
    liquidacionId: number;
    expensas: ExpensaCreateInput[];
  },
) {
  const data = params.expensas.map((expensa) => ({
    liquidacionId: params.liquidacionId,
    unidadId: expensa.unidadId,
    monto: expensa.monto,
    saldo: expensa.saldo,
    estado: expensa.estado ?? "PENDIENTE",
  }));

  if (data.length === 0) {
    return;
  }

  const existingCount = await db.expensa.count({
    where: { liquidacionId: params.liquidacionId },
  });

  console.info("[expensa] create batch", {
    liquidacionId: params.liquidacionId,
    count: data.length,
    existingCount,
    includesId: data.some((item) => Object.prototype.hasOwnProperty.call(item, "id")),
  });

  for (const item of data) {
    await db.expensa.create({ data: item });
  }
}
