import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";

type JsonObj = Record<string, unknown>;

type TableTask = {
  name: string;
  upsert: (tx: PrismaClient, row: JsonObj) => Promise<void>;
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? "",
    },
  },
});

const DATE_FIELDS: Record<string, string[]> = {
  User: ["emailVerified", "createdAt", "updatedAt"],
  Consorcio: ["fechaCreacion"],
  ConsorcioCuentaBancaria: ["createdAt", "updatedAt"],
  Unidad: ["createdAt", "updatedAt"],
  Persona: ["createdAt", "updatedAt"],
  UserConsorcio: ["createdAt"],
  ConsorcioAdministrador: ["desde", "hasta", "actaSubidaAt"],
  UnidadPersona: ["desde", "hasta"],
  ProveedorConsorcio: ["desde", "hasta"],
  Proveedor: ["fechaInicio", "fechaBaja", "createdAt", "updatedAt"],
  Gasto: ["fecha", "createdAt", "updatedAt"],
  Liquidacion: ["fechaEmision", "fechaVencimiento", "createdAt", "updatedAt"],
  Expensa: ["createdAt", "updatedAt"],
  LiquidacionArchivo: ["reemplazadoAt", "createdAt"],
  LiquidacionDeuda: ["fechaCalculoInteres", "createdAt"],
  LiquidacionGastoHistorico: ["fecha", "createdAt"],
  LiquidacionProrrateoUnidad: ["createdAt", "updatedAt"],
  LiquidacionRegeneracionJob: ["startedAt", "finishedAt", "createdAt", "updatedAt"],
  Pago: ["fechaPago", "createdAt"],
  Session: ["expires"],
  VerificationToken: ["expires"],
};

const BOOLEAN_FIELDS: Record<string, string[]> = {
  User: ["activo"],
  Proveedor: ["activo"],
  ConsorcioCuentaBancaria: ["activa", "esCuentaExpensas", "qrEnabled", "qrExperimental"],
  LiquidacionArchivo: ["activo"],
};

function resolveSqlitePath() {
  const envPath = process.env.SQLITE_PATH;
  const candidates = [
    envPath,
    path.resolve(process.cwd(), "prisma", "dev.db"),
    path.resolve(process.cwd(), "prisma", "prisma", "dev.db"),
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`No se encontro SQLite. Defini SQLITE_PATH. Intentados: ${candidates.join(", ")}`);
}


function safeDate(value: any): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}
function normalizeRow(table: string, row: JsonObj): JsonObj {
  const out: JsonObj = { ...row };

  for (const field of DATE_FIELDS[table] ?? []) {
    const value = out[field];
    out[field] = safeDate(value);
  }

  for (const field of BOOLEAN_FIELDS[table] ?? []) {
    const value = out[field];
    if (value === null || value === undefined) continue;

    if (typeof value === "boolean") {
      out[field] = value;
      continue;
    }

    if (typeof value === "number") {
      out[field] = value === 1;
      continue;
    }

    if (typeof value === "string") {
      const lower = value.toLowerCase();
      out[field] = lower === "1" || lower === "true";
    }
  }

  return out;
}

function readRows(db: Database.Database, table: string): JsonObj[] {
  try {
    return db.prepare(`SELECT * FROM "${table}"`).all() as JsonObj[];
  } catch {
    return [];
  }
}

function without(obj: JsonObj, keys: string[]): JsonObj {
  const out: JsonObj = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k)) out[k] = v;
  }
  return out;
}

const tasks: TableTask[] = [
  {
    name: "User",
    upsert: async (tx, row) => {
      const email = typeof row.email === "string" && row.email.trim().length > 0 ? row.email.trim() : null;
      const data = {
        name: row.name ?? null,
        email,
        emailVerified: row.emailVerified as any,
        image: row.image ?? null,
        role: row.role as any,
        activo: row.activo as any,
        createdAt: row.createdAt as any,
        updatedAt: row.updatedAt as any,
      };

      if (email) {
        const existingByEmail = await tx.user.findUnique({ where: { email } });
        if (existingByEmail) {
          await tx.user.update({
            where: { email },
            data,
          });
          return;
        }
      }

      await tx.user.upsert({
        where: { id: String(row.id) },
        create: {
          id: String(row.id),
          ...data,
        } as any,
        update: data as any,
      });
    },
  },
  {
    name: "Consorcio",
    upsert: async (tx, row) => {
      await tx.consorcio.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "ConsorcioCuentaBancaria",
    upsert: async (tx, row) => {
      await tx.consorcioCuentaBancaria.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "Unidad",
    upsert: async (tx, row) => {
      await tx.unidad.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "Persona",
    upsert: async (tx, row) => {
      await tx.persona.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "Proveedor",
    upsert: async (tx, row) => {
      await tx.proveedor.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "UserConsorcio",
    upsert: async (tx, row) => {
      await tx.userConsorcio.upsert({
        where: { userId_consorcioId: { userId: String(row.userId), consorcioId: Number(row.consorcioId) } },
        create: row as any,
        update: without(row, ["id", "userId", "consorcioId"]) as any,
      });
    },
  },
  {
    name: "ConsorcioAdministrador",
    upsert: async (tx, row) => {
      await tx.consorcioAdministrador.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "UnidadPersona",
    upsert: async (tx, row) => {
      await tx.unidadPersona.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "ProveedorConsorcio",
    upsert: async (tx, row) => {
      await tx.proveedorConsorcio.upsert({
        where: { proveedorId_consorcioId: { proveedorId: Number(row.proveedorId), consorcioId: Number(row.consorcioId) } },
        create: row as any,
        update: without(row, ["id", "proveedorId", "consorcioId"]) as any,
      });
    },
  },
  {
    name: "Liquidacion",
    upsert: async (tx, row) => {
      await tx.liquidacion.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "Gasto",
    upsert: async (tx, row) => {
      await tx.gasto.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "Expensa",
    upsert: async (tx, row) => {
      await tx.expensa.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "LiquidacionArchivo",
    upsert: async (tx, row) => {
      await tx.liquidacionArchivo.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "LiquidacionDeuda",
    upsert: async (tx, row) => {
      await tx.liquidacionDeuda.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "LiquidacionGastoHistorico",
    upsert: async (tx, row) => {
      await tx.liquidacionGastoHistorico.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "LiquidacionProrrateoUnidad",
    upsert: async (tx, row) => {
      await tx.liquidacionProrrateoUnidad.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "LiquidacionRegeneracionJob",
    upsert: async (tx, row) => {
      await tx.liquidacionRegeneracionJob.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "Pago",
    upsert: async (tx, row) => {
      await tx.pago.upsert({ where: { id: Number(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "Account",
    upsert: async (tx, row) => {
      const provider = String(row.provider ?? "");
      const providerAccountId = String(row.providerAccountId ?? "");

      const data = {
        userId: String(row.userId),
        type: String(row.type),
        provider,
        providerAccountId,
        refresh_token: row.refresh_token ?? null,
        access_token: row.access_token ?? null,
        expires_at: row.expires_at ?? null,
        token_type: row.token_type ?? null,
        scope: row.scope ?? null,
        id_token: row.id_token ?? null,
        session_state: row.session_state ?? null,
      };

      const existing = await tx.account.findFirst({
        where: {
          provider,
          providerAccountId,
        },
      });

      if (existing) {
        await tx.account.update({
          where: { id: existing.id },
          data,
        });
        return;
      }

      await tx.account.create({
        data: {
          id: String(row.id),
          ...data,
        } as any,
      });
    },
  },
  {
    name: "Session",
    upsert: async (tx, row) => {
      await tx.session.upsert({ where: { id: String(row.id) }, create: row as any, update: without(row, ["id"]) as any });
    },
  },
  {
    name: "VerificationToken",
    upsert: async (tx, row) => {
      await tx.verificationToken.upsert({
        where: { identifier_token: { identifier: String(row.identifier), token: String(row.token) } },
        create: row as any,
        update: { expires: row.expires as any },
      });
    },
  },
];

const SERIAL_TABLES = [
  "Consorcio",
  "ConsorcioCuentaBancaria",
  "Unidad",
  "Persona",
  "Proveedor",
  "UserConsorcio",
  "ConsorcioAdministrador",
  "UnidadPersona",
  "ProveedorConsorcio",
  "Liquidacion",
  "Gasto",
  "Expensa",
  "LiquidacionArchivo",
  "LiquidacionDeuda",
  "LiquidacionGastoHistorico",
  "LiquidacionProrrateoUnidad",
  "LiquidacionRegeneracionJob",
  "Pago",
];

async function resetSequences() {
  for (const table of SERIAL_TABLES) {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${table}"', 'id'),
        COALESCE((SELECT MAX(id) FROM "${table}"), 1),
        true
      );
    `);
  }
}

async function migrate() {
  const sqlitePath = resolveSqlitePath();
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error("DATABASE_URL no esta definida");
  }

  if (dbUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL apunta a SQLite. Debe apuntar a PostgreSQL (Neon).");
  }

  console.log(`SQLite origen: ${sqlitePath}`);
  console.log("PostgreSQL destino: DATABASE_URL (Neon)");

  const sqlite = new Database(sqlitePath, { readonly: true });
  const summary: Record<string, number> = {};

  try {
    for (const task of tasks) {
      console.log(`\nMigrando ${task.name}...`);
      const rows = readRows(sqlite, task.name);
      let migrated = 0;

      for (const rawRow of rows) {
        const row = normalizeRow(task.name, rawRow);
        await task.upsert(prisma, row);
        migrated += 1;
      }

      summary[task.name] = migrated;
      console.log(`Migrados: ${migrated} registros`);
    }

    await resetSequences();

    console.log("\nMigracion completada");
    for (const task of tasks) {
      console.log(`${task.name}: ${summary[task.name] ?? 0}`);
    }
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

migrate().catch((error) => {
  console.error("\nError durante migracion SQLite -> PostgreSQL");
  console.error(error);
  process.exit(1);
});



