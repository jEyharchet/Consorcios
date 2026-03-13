import { auth } from '../../../../../../../auth';

import { hasConsorcioAccessForUserId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return new Response('Acta invalida', { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return new Response('No autorizado', { status: 401 });
  }

  const relacion = await prisma.consorcioAdministrador.findUnique({
    where: { id },
    select: {
      consorcioId: true,
      actaNombreOriginal: true,
      actaMimeType: true,
      actaPath: true,
      actaContenido: true,
    },
  });

  if (!relacion) {
    return new Response('Acta no encontrada', { status: 404 });
  }

  const allowed = await hasConsorcioAccessForUserId(userId, relacion.consorcioId);
  if (!allowed) {
    return new Response('Sin acceso a este consorcio', { status: 403 });
  }

  if (relacion.actaContenido) {
    return new Response(relacion.actaContenido, {
      headers: {
        'Content-Type': relacion.actaMimeType ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${relacion.actaNombreOriginal ?? `acta-${id}`}"`,
      },
    });
  }

  if (relacion.actaPath && relacion.actaPath.startsWith('/uploads/')) {
    return Response.redirect(new URL(relacion.actaPath, req.url), 302);
  }

  return new Response('Acta no encontrada', { status: 404 });
}

