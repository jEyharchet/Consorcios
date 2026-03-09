import { auth } from '../../../../../../auth';

import { prisma } from '@/lib/prisma';
import { startRegeneracionArchivosJob } from '@/lib/liquidacion-regeneracion-job';

export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function requireOperativeAccess(userId: string, consorcioId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, activo: true },
  });

  if (!user || !user.activo) {
    return { ok: false as const, status: 401, reason: 'no_autorizado' };
  }

  if (user.role === 'SUPER_ADMIN') {
    return { ok: true as const, userId: user.id };
  }

  const assignment = await prisma.userConsorcio.findFirst({
    where: {
      userId: user.id,
      consorcioId,
      role: { in: ['ADMIN', 'OPERADOR'] },
    },
    select: { id: true },
  });

  if (!assignment) {
    return { ok: false as const, status: 403, reason: 'sin_permiso' };
  }

  return { ok: true as const, userId: user.id };
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const liquidacionId = Number(params.id);

  if (!Number.isInteger(liquidacionId) || liquidacionId <= 0) {
    return json({ ok: false, reason: 'liquidacion_invalida' }, 400);
  }

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return json({ ok: false, reason: 'no_autorizado' }, 401);
  }

  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    select: { id: true, consorcioId: true, estado: true },
  });

  if (!liquidacion) {
    return json({ ok: false, reason: 'liquidacion_inexistente' }, 404);
  }

  const access = await requireOperativeAccess(userId, liquidacion.consorcioId);
  if (!access.ok) {
    return json({ ok: false, reason: access.reason }, access.status);
  }

  const result = await startRegeneracionArchivosJob({
    liquidacionId,
    requestedByUserId: access.userId,
  });

  if (!result.ok) {
    return json(result, result.reason === 'estado_no_regenerable' ? 409 : 400);
  }

  return json({ ok: true, jobId: result.jobId, reused: result.reused });
}
