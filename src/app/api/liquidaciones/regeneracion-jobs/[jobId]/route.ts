import { auth } from '../../../../../../auth';

import { hasConsorcioAccessForUserId } from '@/lib/auth';
import { createRegeneracionJobRunnerToken, getRegeneracionJob } from '@/lib/liquidacion-regeneracion-job';

export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function maybeDispatchRegeneracionJob(origin: string, job: {
  id: number;
  tipo: string;
  status: string;
  finishedAt: Date | null;
  updatedAt: Date;
}) {
  if (job.tipo !== 'REGENERAR_ARCHIVOS' || job.finishedAt) {
    return;
  }

  if (job.status !== 'PENDING' && job.status !== 'RUNNING' && job.status !== 'VALIDATING') {
    return;
  }

  const staleMs = Date.now() - new Date(job.updatedAt).getTime();
  if (job.status !== 'PENDING' && staleMs < 30000) {
    return;
  }

  const url = new URL(`/api/liquidaciones/regeneracion-jobs/${job.id}/run`, origin);
  const token = createRegeneracionJobRunnerToken(job.id);

  void fetch(url, {
    method: 'POST',
    headers: {
      'x-regeneracion-runner-token': token,
    },
  }).catch((error) => {
    console.error('[regeneracion-job] redispatch failed', {
      jobId: job.id,
      message: error instanceof Error ? error.message : String(error),
    });
  });
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

  maybeDispatchRegeneracionJob(new URL(_req.url).origin, job);

  return json({
    ok: true,
    job: {
      id: job.id,
      liquidacionId: job.liquidacionId,
      tipo: job.tipo,
      status: job.status,
      stage: job.stage,
      expectedFiles: job.expectedFiles,
      generatedFiles: job.generatedFiles,
      validatedFiles: job.validatedFiles,
      message: job.message,
      errorDetail: job.errorDetail,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
  });
}
