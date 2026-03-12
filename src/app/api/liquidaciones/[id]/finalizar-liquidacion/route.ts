import { auth } from '../../../../../../auth';

import { hasConsorcioRoleForUserId } from '@/lib/auth';
import { startFinalizacionLiquidacionJob } from '@/lib/liquidacion-regeneracion-job';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? value : null;
}

async function requireOperativeAccess(userId: string, consorcioId: number) {
  const allowed = await hasConsorcioRoleForUserId(userId, consorcioId, ['ADMIN', 'OPERADOR']);
  if (!allowed) {
    return { ok: false as const, status: 403, reason: 'sin_permiso' };
  }

  return { ok: true as const, userId };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
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

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (liquidacion.estado !== 'FINALIZADA' && liquidacion.estado !== 'CERRADA') {
    await prisma.liquidacion.update({
      where: { id: liquidacion.id },
      data: {
        datosJuicios: normalizeText(payload.datosJuicios),
        recomendacionesGenerales: normalizeText(payload.recomendacionesGenerales),
        novedadesMes: normalizeText(payload.novedadesMes),
      },
    });
  }

  const result = await startFinalizacionLiquidacionJob({
    liquidacionId,
    requestedByUserId: access.userId,
  });

  if (!result.ok) {
    return json(result, 409);
  }

  return json({ ok: true, jobId: result.jobId, reused: result.reused });
}
