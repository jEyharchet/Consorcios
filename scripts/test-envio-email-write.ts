import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { withEnvioEmailIdRecovery, isEnvioEmailIdCollision } from "../src/lib/envio-email-write";
import { prisma } from "../src/lib/prisma";

const collision = new Prisma.PrismaClientKnownRequestError("duplicate id", {
  code: "P2002", clientVersion: "5.19.1",
  meta: { modelName: "EnvioEmail", target: ["id"] },
});
const unrelated = new Prisma.PrismaClientKnownRequestError("duplicate other", {
  code: "P2002", clientVersion: "5.19.1",
  meta: { modelName: "Expensa", target: ["id"] },
});

async function main() {
  assert.equal(isEnvioEmailIdCollision(collision), true);
  assert.equal(isEnvioEmailIdCollision(unrelated), false);
  for (const scenario of ["success", "repair", "unrelated", "retry-fails", "repair-fails"]) {
    const calls: string[] = [];
    const failure = new Error("repair failed");
    let attempts = 0;
    const db = {
      envioEmail: { create: async () => {
        calls.push("create");
        attempts++;
        if (scenario === "unrelated") throw unrelated;
        if (scenario === "retry-fails" || (scenario !== "success" && attempts === 1)) throw collision;
        return { id: 42 };
      } },
      $transaction: async (callback: (tx: unknown) => Promise<void>) => {
        calls.push("transaction");
        await callback({
          $executeRaw: async () => { calls.push("lock"); },
          $queryRaw: async () => { calls.push("realign"); if (scenario === "repair-fails") throw failure; },
        });
      },
    } as unknown as typeof prisma;
    if (scenario === "success" || scenario === "repair") {
      assert.deepEqual(await withEnvioEmailIdRecovery(() => db.envioEmail.create({ data: { consorcioId: 1, tipoEnvio: "LIQUIDACION", asunto: "Test", estado: "PENDIENTE" } }), db), { id: 42 });
    } else {
      const expected = scenario === "unrelated" ? unrelated : scenario === "repair-fails" ? failure : collision;
      await assert.rejects(withEnvioEmailIdRecovery(() => db.envioEmail.create({ data: { consorcioId: 1, tipoEnvio: "LIQUIDACION", asunto: "Test", estado: "PENDIENTE" } }), db), (error) => error === expected);
    }
    assert.deepEqual(calls, scenario === "success" || scenario === "unrelated"
      ? ["create"]
      : scenario === "repair-fails" ? ["create", "transaction", "lock", "realign"]
      : ["create", "transaction", "lock", "realign", "create"]);
  }
  console.log("EnvioEmail: collision detection and 5 creation scenarios passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
