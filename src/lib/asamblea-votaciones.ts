import "server-only";

import { ASAMBLEA_ESTADO, ASAMBLEA_VOTACION_ESTADO, ASAMBLEA_VOTO_VALOR } from "./administracion-shared";
import { prisma } from "./prisma";

export function formatPersonaNombre(persona: { nombre: string; apellido: string }) {
  return `${persona.apellido}, ${persona.nombre}`;
}

export function summarizeVotacion(params: {
  totalPersonas: number;
  votos: Array<{ valor: string }>;
}) {
  const positivos = params.votos.filter((voto) => voto.valor === ASAMBLEA_VOTO_VALOR.POSITIVO).length;
  const negativos = params.votos.filter((voto) => voto.valor === ASAMBLEA_VOTO_VALOR.NEGATIVO).length;
  const pendientes = Math.max(params.totalPersonas - params.votos.length, 0);

  return {
    positivos,
    negativos,
    pendientes,
  };
}

export async function getPersonasConsorcioParaVotacion(consorcioId: number) {
  const today = new Date();

  const relaciones = await prisma.unidadPersona.findMany({
    where: {
      unidad: { consorcioId },
      desde: { lte: today },
      OR: [{ hasta: null }, { hasta: { gte: today } }],
    },
    orderBy: [
      { persona: { apellido: "asc" } },
      { persona: { nombre: "asc" } },
      { unidad: { identificador: "asc" } },
    ],
    select: {
      personaId: true,
      unidad: {
        select: {
          identificador: true,
          tipo: true,
        },
      },
      persona: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          email: true,
        },
      },
    },
  });

  const grouped = new Map<
    number,
    {
      persona: {
        id: number;
        nombre: string;
        apellido: string;
        email: string | null;
      };
      unidades: string[];
    }
  >();

  for (const relacion of relaciones) {
    const current = grouped.get(relacion.personaId);
    const unidadLabel = `${relacion.unidad.identificador} (${relacion.unidad.tipo})`;

    if (!current) {
      grouped.set(relacion.personaId, {
        persona: relacion.persona,
        unidades: [unidadLabel],
      });
      continue;
    }

    if (!current.unidades.includes(unidadLabel)) {
      current.unidades.push(unidadLabel);
    }
  }

  return Array.from(grouped.values()).map((entry) => ({
    ...entry.persona,
    unidadesLabel: entry.unidades.join(" / "),
  }));
}

export async function registrarVotoAsamblea(params: {
  votacionId: number;
  personaId: number;
  valor: string;
  registradoPorAdministrador: boolean;
  registradoPorUserId: string | null;
}) {
  return prisma.asambleaVotacionVoto.upsert({
    where: {
      votacionId_personaId: {
        votacionId: params.votacionId,
        personaId: params.personaId,
      },
    },
    update: {
      valor: params.valor,
      votadoAt: new Date(),
      registradoPorAdministrador: params.registradoPorAdministrador,
      registradoPorUserId: params.registradoPorUserId,
    },
    create: {
      votacionId: params.votacionId,
      personaId: params.personaId,
      valor: params.valor,
      registradoPorAdministrador: params.registradoPorAdministrador,
      registradoPorUserId: params.registradoPorUserId,
    },
  });
}

export function canReceiveVotes(estado: string) {
  return estado === ASAMBLEA_VOTACION_ESTADO.ABIERTA;
}

export function canEditVotos(params: { votacionEstado: string; asambleaEstado: string }) {
  return (
    params.votacionEstado === ASAMBLEA_VOTACION_ESTADO.ABIERTA &&
    (params.asambleaEstado === ASAMBLEA_ESTADO.CONVOCADA || params.asambleaEstado === ASAMBLEA_ESTADO.REALIZADA)
  );
}

export function getVoteBlockedMessage(asambleaEstado: string) {
  if (asambleaEstado === ASAMBLEA_ESTADO.BORRADOR) {
    return "La votacion todavia no esta habilitada.";
  }

  if (asambleaEstado === ASAMBLEA_ESTADO.CERRADA) {
    return "La votacion esta cerrada y no admite modificaciones.";
  }

  return "La votacion no esta abierta para recibir votos.";
}

export function getVoteBlockedError(asambleaEstado: string) {
  if (asambleaEstado === ASAMBLEA_ESTADO.BORRADOR) {
    return "votacion_no_habilitada";
  }

  if (asambleaEstado === ASAMBLEA_ESTADO.CERRADA) {
    return "votacion_bloqueada";
  }

  return "votacion_cerrada";
}
