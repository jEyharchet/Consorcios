import { auth } from '../../../../../../auth';

import { getRegeneracionJob } from '@/lib/liquidacion-regeneracion-job';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function userHasAccess(userId: string, consorcioId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, activo: true },
  });

  if (!user || !user.activo) {
    return false;
  }

  if (user.role === 'SUPER_ADMIN') {
    return true;
  }

  const assignment = await prisma.userConsorcio.findFirst({
    where: {
      userId: user.id,
      consorcioId,
    },
    select: { id: true },
  });

  return Boolean(assignment);
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

  const hasAccess = await userHasAccess(userId, job.liquidacion.consorcioId);
  if (!hasAccess) {
    return json({ ok: false, reason: 'sin_permiso' }, 403);
  }

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

