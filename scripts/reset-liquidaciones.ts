import { rm } from "fs/promises";
import path from "path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CounterMap = Record<string, number>;

type Options = {
  dryRun: boolean;
  removeFiles: boolean;
};

type Counts = {
  transaccionales: CounterMap;
  maestras: CounterMap;
};

type DbInfo = {
  databaseUrl: string;
  sqliteFiles: string[];
};

function parseArgs(argv: string[]): Options {
  const args = new Set(argv);
  return {
    dryRun: args.has("--dry-run"),
    removeFiles: !args.has("--keep-files"),
  };
}

function logHeader(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function safeAbsolutePublicPath(rutaArchivo: string) {
  const relative = rutaArchivo.replace(/^\/+/, "");
  if (!relative) return null;

  const absolute = path.resolve(process.cwd(), "public", relative);
  const allowedBase = path.resolve(process.cwd(), "public", "uploads", "liquidaciones");

  if (!absolute.startsWith(allowedBase)) {
    return null;
  }

  return absolute;
}

function logTableCounts(title: string, map: CounterMap) {
  console.log(`\n${title}`);
  Object.entries(map).forEach(([name, count]) => {
    console.log(`- ${name}: ${count}`);
  });
}

async function getDbInfo(): Promise<DbInfo> {
  const databaseUrl = process.env.DATABASE_URL ?? "(sin DATABASE_URL)";

  let sqliteFiles: string[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ file: string }>>(
      "PRAGMA database_list;",
    );
    sqliteFiles = rows.map((r) => r.file).filter(Boolean);
  } catch {
    sqliteFiles = [];
  }

  return { databaseUrl, sqliteFiles };
}

async function countTables(): Promise<Counts> {
  const [
    liquidacion,
    liquidacionProrrateoUnidad,
    expensa,
    pago,
    liquidacionDeuda,
    liquidacionArchivo,
    liquidacionRegeneracionJob,
    liquidacionGastoHistorico,
    gastoConLiquidacion,
    consorcio,
    consorcioCuentaBancaria,
    unidad,
    unidadPersona,
    persona,
    consorcioAdministrador,
    proveedor,
    proveedorConsorcio,
    user,
    userConsorcio,
    account,
    session,
    verificationToken,
  ] = await Promise.all([
    prisma.liquidacion.count(),
    prisma.liquidacionProrrateoUnidad.count(),
    prisma.expensa.count(),
    prisma.pago.count(),
    prisma.liquidacionDeuda.count(),
    prisma.liquidacionArchivo.count(),
    prisma.liquidacionRegeneracionJob.count(),
    prisma.liquidacionGastoHistorico.count(),
    prisma.gasto.count({ where: { liquidacionId: { not: null } } }),
    prisma.consorcio.count(),
    prisma.consorcioCuentaBancaria.count(),
    prisma.unidad.count(),
    prisma.unidadPersona.count(),
    prisma.persona.count(),
    prisma.consorcioAdministrador.count(),
    prisma.proveedor.count(),
    prisma.proveedorConsorcio.count(),
    prisma.user.count(),
    prisma.userConsorcio.count(),
    prisma.account.count(),
    prisma.session.count(),
    prisma.verificationToken.count(),
  ]);

  return {
    transaccionales: {
      liquidacion,
      liquidacionProrrateoUnidad,
      expensa,
      pago,
      liquidacionDeuda,
      liquidacionArchivo,
      liquidacionRegeneracionJob,
      liquidacionGastoHistorico,
      gastoConLiquidacion,
    },
    maestras: {
      consorcio,
      consorcioCuentaBancaria,
      unidad,
      unidadPersona,
      persona,
      consorcioAdministrador,
      proveedor,
      proveedorConsorcio,
      user,
      userConsorcio,
      account,
      session,
      verificationToken,
    },
  };
}

async function resetLiquidaciones(options: Options) {
  logHeader("Reset selectivo del subdominio de liquidaciones");
  console.log(`Modo dry-run: ${options.dryRun ? "SI" : "NO"}`);
  console.log(`Eliminar archivos fisicos: ${options.removeFiles ? "SI" : "NO"}`);

  const dbInfo = await getDbInfo();
  console.log(`DATABASE_URL: ${dbInfo.databaseUrl}`);
  if (dbInfo.sqliteFiles.length > 0) {
    console.log("SQLite file(s) abiertos por Prisma:");
    dbInfo.sqliteFiles.forEach((f) => console.log(`- ${f}`));
  }

  console.log("\nDecision sobre deuda/pagos/intereses:");
  console.log("- Se incluyen en el reset porque son transaccionales derivadas de expensas de liquidacion.");
  console.log("- Se vacian: pago, expensa y liquidacionDeuda.");
  console.log("- No se tocan personas/unidades/proveedores/consorcios ni sus relaciones maestras.");

  const before = await countTables();

  logTableCounts("Tablas transaccionales objetivo:", before.transaccionales);
  logTableCounts("Tablas maestras preservadas (sin cambios):", before.maestras);

  if (options.dryRun) {
    console.log("\nDry-run finalizado. No se realizaron cambios.");
    return;
  }

  const archivos = await prisma.liquidacionArchivo.findMany({
    select: { rutaArchivo: true },
  });

  const roots = Array.from(
    new Set(
      archivos
        .map((a) => safeAbsolutePublicPath(a.rutaArchivo))
        .filter((p): p is string => Boolean(p))
        .map((absPath) => path.dirname(absPath)),
    ),
  );

  const deleted: CounterMap = {};

  await prisma.$transaction(async (tx) => {
    const gastosUpdated = await tx.gasto.updateMany({
      where: { liquidacionId: { not: null } },
      data: { liquidacionId: null },
    });
    deleted.gastoDesasociado = gastosUpdated.count;

    const jobs = await tx.liquidacionRegeneracionJob.deleteMany();
    deleted.liquidacionRegeneracionJob = jobs.count;

    const archivosDeleted = await tx.liquidacionArchivo.deleteMany();
    deleted.liquidacionArchivo = archivosDeleted.count;

    const gastosHistoricos = await tx.liquidacionGastoHistorico.deleteMany();
    deleted.liquidacionGastoHistorico = gastosHistoricos.count;

    const deudas = await tx.liquidacionDeuda.deleteMany();
    deleted.liquidacionDeuda = deudas.count;

    const pagos = await tx.pago.deleteMany();
    deleted.pago = pagos.count;

    const expensas = await tx.expensa.deleteMany();
    deleted.expensa = expensas.count;

    const prorrateos = await tx.liquidacionProrrateoUnidad.deleteMany();
    deleted.liquidacionProrrateoUnidad = prorrateos.count;

    const liquidaciones = await tx.liquidacion.deleteMany();
    deleted.liquidacion = liquidaciones.count;
  });

  let deletedRoots = 0;
  if (options.removeFiles && roots.length > 0) {
    for (const root of roots) {
      await rm(root, { recursive: true, force: true });
      deletedRoots += 1;
    }
  }

  logHeader("Resultado del reset");
  logTableCounts("Registros afectados por tabla:", deleted);

  if (options.removeFiles) {
    console.log(`- carpetas de archivos fisicos eliminadas: ${deletedRoots}`);
  } else {
    console.log("- archivos fisicos: preservados (--keep-files)");
  }

  const after = await countTables();
  logTableCounts("Verificacion post-reset (transaccionales):", after.transaccionales);
  logTableCounts("Verificacion post-reset (maestras preservadas):", after.maestras);

  if (after.transaccionales.liquidacion > 0) {
    throw new Error(
      `Reset incompleto: quedaron ${after.transaccionales.liquidacion} liquidacion(es). Revisar DATABASE_URL y entorno.`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    await resetLiquidaciones(options);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nError durante reset selectivo de liquidaciones:");
  console.error(error);
  process.exit(1);
});
