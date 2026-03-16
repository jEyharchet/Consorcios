import { auth } from "../../../../../../../auth";

import { hasConsorcioRoleForUserId } from "@/lib/auth";
import { getRegeneracionJob, isValidRunnerToken, runFinalizacionLiquidacionJob, runRegeneracionArchivosJob } from "@/lib/liquidacion-regeneracion-job";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  const jobId = Number(params.jobId);

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return json({ ok: false, reason: "job_invalido" }, 400);
  }

  const token = req.headers.get("x-liquidacion-job-token");
  const tokenIsValid = isValidRunnerToken(jobId, token);

  const job = await getRegeneracionJob(jobId);
  if (!job) {
    return json({ ok: false, reason: "job_inexistente" }, 404);
  }

  if (!tokenIsValid) {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return json({ ok: false, reason: "no_autorizado" }, 401);
    }

    const allowed = await hasConsorcioRoleForUserId(userId, job.liquidacion.consorcioId, ["ADMIN", "OPERADOR"]);
    if (!allowed) {
      return json({ ok: false, reason: "sin_permiso" }, 403);
    }
  }

  if (job.tipo === "REGENERAR_ARCHIVOS") {
    await runRegeneracionArchivosJob(jobId);
    return json({ ok: true, tipo: job.tipo });
  }

  if (job.tipo === "FINALIZAR_LIQUIDACION") {
    await runFinalizacionLiquidacionJob(jobId);
    return json({ ok: true, tipo: job.tipo });
  }

  return json({ ok: false, reason: "tipo_invalido" }, 400);
}
