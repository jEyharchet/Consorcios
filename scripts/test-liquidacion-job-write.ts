import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { createLiquidacionJob, isLiquidacionJobIdCollision } from "../src/lib/liquidacion-job-write";
import { prisma } from "../src/lib/prisma";

const collision = new Prisma.PrismaClientKnownRequestError("duplicate id", {
  code: "P2002", clientVersion: "5.19.1",
  meta: { modelName: "LiquidacionRegeneracionJob", target: ["id"] },
});
const unrelated = new Prisma.PrismaClientKnownRequestError("duplicate other", {
  code: "P2002", clientVersion: "5.19.1",
  meta: { modelName: "Expensa", target: ["id"] },
});
const data = { liquidacion: { connect: { id: 9 } }, tipo: "FINALIZAR_LIQUIDACION", status: "PENDING", stage: "PREPARING" };

async function main() {
  assert.equal(isLiquidacionJobIdCollision(collision), true);
  assert.equal(isLiquidacionJobIdCollision(unrelated), false);
  for (const scenario of ["success", "repair", "unrelated", "retry-fails", "repair-fails"]) {
    const calls: string[] = [];
    const failure = new Error("repair failed");
    let attempts = 0;
    const db = {
      liquidacionRegeneracionJob: { create: async () => {
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
      assert.deepEqual(await createLiquidacionJob(data, db), { id: 42 });
    } else {
      const expected = scenario === "unrelated" ? unrelated : scenario === "repair-fails" ? failure : collision;
      await assert.rejects(createLiquidacionJob(data, db), (error) => error === expected);
    }
    assert.deepEqual(calls, scenario === "success" || scenario === "unrelated"
      ? ["create"]
      : scenario === "repair-fails" ? ["create", "transaction", "lock", "realign"]
      : ["create", "transaction", "lock", "realign", "create"]);
  }
  console.log("Liquidacion job: collision detection and 5 creation scenarios passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
