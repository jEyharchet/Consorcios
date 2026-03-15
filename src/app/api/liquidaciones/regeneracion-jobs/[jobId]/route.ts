import { auth } from '../../../../../../auth';

import { hasConsorcioAccessForUserId } from '@/lib/auth';
import { getRegeneracionJob, retryLiquidacionJobIfNeeded } from '@/lib/liquidacion-regeneracion-job';

export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const jobId = Number(params.jobId);

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return json({ ok: false, reason: 'job_invalido' }, 400);
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return json({ ok: false, reason: 'no_autorizado' }, 401);
  }

  const job = await getRegeneracionJob(jobId);

  if (!job) {
    return json({ ok: false, reason: 'job_inexistente' }, 404);
  }

  const hasAccess = await hasConsorcioAccessForUserId(userId, job.liquidacion.consorcioId);
  if (!hasAccess) {
    return json({ ok: false, reason: 'sin_permiso' }, 403);
  }

  await retryLiquidacionJobIfNeeded(job.id);

  const refreshedJob = await getRegeneracionJob(jobId);
  if (!refreshedJob) {
    return json({ ok: false, reason: 'job_inexistente' }, 404);
  }

  return json({
    ok: true,
    job: {
      id: refreshedJob.id,
      liquidacionId: refreshedJob.liquidacionId,
      tipo: refreshedJob.tipo,
      status: refreshedJob.status,
      stage: refreshedJob.stage,
      expectedFiles: refreshedJob.expectedFiles,
      generatedFiles: refreshedJob.generatedFiles,
      validatedFiles: refreshedJob.validatedFiles,
      message: refreshedJob.message,
      errorDetail: refreshedJob.errorDetail,
      startedAt: refreshedJob.startedAt,
      finishedAt: refreshedJob.finishedAt,
      createdAt: refreshedJob.createdAt,
      updatedAt: refreshedJob.updatedAt,
    },
  });
}
