import { auth } from '../../../../../../../auth';

import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

type DownloadRequestBody = {
  archivoIds?: number[];
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function parseBody(value: unknown): DownloadRequestBody {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const body = value as DownloadRequestBody;
  if (!Array.isArray(body.archivoIds)) {
    return {};
  }

  const sanitized = body.archivoIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  return { archivoIds: Array.from(new Set(sanitized)) };
}

async function userHasConsorcioAccess(userId: string, consorcioId: number) {
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
    select: {
      id: true,
      consorcioId: true,
      archivos: {
        where: { activo: true },
        select: {
          id: true,
          nombreArchivo: true,
          rutaArchivo: true,
        },
      },
    },
  });

  if (!liquidacion) {
    return json({ ok: false, reason: 'liquidacion_inexistente' }, 404);
  }

  const allowed = await userHasConsorcioAccess(userId, liquidacion.consorcioId);
  if (!allowed) {
    return json({ ok: false, reason: 'sin_permiso' }, 403);
  }

  const parsed = parseBody(await req.json().catch(() => ({})));
  const requestedIds = parsed.archivoIds ?? [];

  if (requestedIds.length === 0) {
    return json({ ok: false, reason: 'sin_archivos_seleccionados' }, 400);
  }

  const allowedSet = new Set(liquidacion.archivos.map((a) => a.id));
  const selected = liquidacion.archivos.filter((a) => requestedIds.includes(a.id) && allowedSet.has(a.id));

  if (selected.length === 0) {
    return json({ ok: false, reason: 'archivos_no_validos' }, 400);
  }

  return json({
    ok: true,
    archivos: selected,
  });
}
