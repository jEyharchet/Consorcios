import {
  runRegeneracionArchivosJob,
  verifyRegeneracionJobRunnerToken,
} from "@/lib/liquidacion-regeneracion-job";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function POST(_req: Request, { params }: { params: { jobId: string } }) {
  const jobId = Number(params.jobId);

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return json({ ok: false, reason: "job_invalido" }, 400);
  }

  const token = _req.headers.get("x-regeneracion-runner-token");
  if (!verifyRegeneracionJobRunnerToken(jobId, token)) {
    return json({ ok: false, reason: "token_invalido" }, 401);
  }

  await runRegeneracionArchivosJob(jobId);
  return json({ ok: true });
}
