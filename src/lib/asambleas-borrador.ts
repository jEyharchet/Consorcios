import { ASAMBLEA_ESTADO } from "./administracion-shared";
import { prisma } from "./prisma";

export type PuntoEditor = {
  id: number | null;
  titulo: string;
};

export type DatosAsambleaEditor = {
  tipo: string;
  fecha: Date | null;
  hora: string;
  lugar: string;
  observaciones: string | null;
  firmaEspacioPx: number | null;
  firmaAltoPx: number | null;
};

/**
 * Actualiza un borrador desde el editor. Los puntos conservan su id (y sus votaciones)
 * aunque se reordenen; se borran solo los quitados, salvo que tengan votaciones.
 * No valida permisos: quien llama debe pasar por requireConsorcioRole.
 */
export async function actualizarBorradorAsamblea(
  asambleaId: number,
  consorcioId: number,
  datos: DatosAsambleaEditor,
  puntos: PuntoEditor[],
) {
  return prisma.$transaction(async (tx) => {
    const asamblea = await tx.asamblea.findUnique({
      where: { id: asambleaId },
      select: {
        consorcioId: true,
        estado: true,
        ordenDia: { select: { id: true, _count: { select: { votaciones: true } } } },
      },
    });

    if (!asamblea || asamblea.consorcioId !== consorcioId) {
      return "asamblea_inexistente" as const;
    }

    if (asamblea.estado !== ASAMBLEA_ESTADO.BORRADOR) {
      return "asamblea_no_borrador" as const;
    }

    // Los puntos conservan su id (y sus votaciones) aunque se reordenen; se borran solo los quitados.
    const existentes = new Map(asamblea.ordenDia.map((item) => [item.id, item._count.votaciones]));
    const conservados = new Set(puntos.map((punto) => punto.id).filter((value): value is number => value !== null && existentes.has(value)));
    const quitados = asamblea.ordenDia.filter((item) => !conservados.has(item.id));

    if (quitados.some((item) => item._count.votaciones > 0)) {
      return "punto_con_votaciones" as const;
    }

    await tx.asamblea.update({ where: { id: asambleaId }, data: datos });

    if (quitados.length > 0) {
      await tx.asambleaOrdenDia.deleteMany({ where: { id: { in: quitados.map((item) => item.id) } } });
    }

    // @@unique([asambleaId, orden]): se pasa a un orden temporal negativo para poder reordenar sin choques.
    for (const puntoId of Array.from(conservados)) {
      await tx.asambleaOrdenDia.update({ where: { id: puntoId }, data: { orden: -puntoId } });
    }

    for (let index = 0; index < puntos.length; index += 1) {
      const punto = puntos[index];
      if (punto.id !== null && conservados.has(punto.id)) {
        await tx.asambleaOrdenDia.update({
          where: { id: punto.id },
          data: { orden: index + 1, titulo: punto.titulo },
        });
      } else {
        await tx.asambleaOrdenDia.create({
          data: { asambleaId, orden: index + 1, titulo: punto.titulo, descripcion: null },
        });
      }
    }

    return "ok" as const;
  }, { timeout: 15000 });
}
