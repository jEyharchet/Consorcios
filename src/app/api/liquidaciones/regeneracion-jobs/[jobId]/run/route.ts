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
  if (!isValidRunnerToken(jobId, token)) {
    return json({ ok: false, reason: "token_invalido" }, 401);
  }

  const job = await getRegeneracionJob(jobId);
  if (!job) {
    return json({ ok: false, reason: "job_inexistente" }, 404);
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
