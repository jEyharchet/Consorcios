import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

type GastoHistoricoInput = {
  id: number;
  fecha: Date;
  periodo: string;
  concepto: string;
  descripcion: string | null;
  tipoExpensa: string;
  rubroExpensa: string;
  monto: number;
  proveedor?: { nombre: string } | null;
};

function isLiquidacionGastoHistoricoIdCollision(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("id")
  );
}

async function realignLiquidacionGastoHistoricoIdSequence(db: DbClient) {
  await db.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"LiquidacionGastoHistorico"', 'id'),
      COALESCE((SELECT MAX(id) + 1 FROM "LiquidacionGastoHistorico"), 1),
      false
    )
  `);
}

export async function createLiquidacionGastosHistoricosWithSequenceRecovery(
  db: DbClient,
  params: {
    liquidacionId: number;
    gastos: GastoHistoricoInput[];
  },
) {
  const data = params.gastos.map((g) => ({
    liquidacionId: params.liquidacionId,
    gastoOrigenId: g.id,
    fecha: g.fecha,
    periodo: g.periodo,
    concepto: g.concepto,
    descripcion: g.descripcion,
    tipoExpensa: g.tipoExpensa,
    rubroExpensa: g.rubroExpensa,
    monto: g.monto,
    proveedorNombre: g.proveedor?.nombre ?? null,
  }));

  if (data.length === 0) {
    return;
  }

  try {
    await db.liquidacionGastoHistorico.createMany({ data });
  } catch (error) {
    if (!isLiquidacionGastoHistoricoIdCollision(error)) {
      throw error;
    }

    await realignLiquidacionGastoHistoricoIdSequence(db);
    await db.liquidacionGastoHistorico.createMany({ data });
  }
}
