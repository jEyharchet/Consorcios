import { prisma } from "./prisma";
import { generarExpensasDefinitivasDesdePaso3, regenerarArchivosLiquidacion } from "./liquidacion-paso4";
import { formatEmailSummary } from "./liquidacion-email";

export type RegeneracionJobStatus = "PENDING" | "RUNNING" | "VALIDATING" | "COMPLETED" | "FAILED";
export type RegeneracionJobStage =
  | "PREPARING"
  | "GENERATING_RENDICION"
  | "GENERATING_BOLETAS"
  | "VERIFYING_FILES"
  | "ACTIVATING_FILES"
  | "DONE";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      detail: error.stack?.slice(0, 2000) ?? null,
    };
  }

  return {
    message: "Error inesperado durante la regeneracion",
    detail: typeof error === "string" ? error.slice(0, 2000) : null,
  };
}

export async function getRegeneracionJob(jobId: number) {
  return prisma.liquidacionRegeneracionJob.findUnique({
    where: { id: jobId },
    include: {
      liquidacion: {
        select: {
          id: true,
          consorcioId: true,
        },
      },
    },
  });
}

export async function startRegeneracionArchivosJob(params: {
  liquidacionId: number;
  requestedByUserId: string;
}) {
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: params.liquidacionId },
    select: {
      id: true,
      estado: true,
    },
  });

  if (!liquidacion) {
    return { ok: false as const, reason: "liquidacion_inexistente" };
  }

  if (liquidacion.estado !== "FINALIZADA" && liquidacion.estado !== "CERRADA") {
    return { ok: false as const, reason: "estado_no_regenerable" };
  }

  const runningOther = await prisma.liquidacionRegeneracionJob.findFirst({
    where: {
      liquidacionId: liquidacion.id,
      status: { in: ["PENDING", "RUNNING", "VALIDATING"] },
      tipo: { not: "REGENERAR_ARCHIVOS" },
    },
    orderBy: { id: "desc" },
  });

  if (runningOther) {
    return { ok: false as const, reason: "proceso_en_curso" };
  }

  const existing = await prisma.liquidacionRegeneracionJob.findFirst({
    where: {
      liquidacionId: liquidacion.id,
      tipo: "REGENERAR_ARCHIVOS",
      status: { in: ["PENDING", "RUNNING", "VALIDATING"] },
    },
    orderBy: { id: "desc" },
  });

  if (existing) {
    return { ok: true as const, jobId: existing.id, reused: true };
  }

  const job = await prisma.liquidacionRegeneracionJob.create({
    data: {
      liquidacionId: liquidacion.id,
      tipo: "REGENERAR_ARCHIVOS",
      status: "PENDING",
      stage: "PREPARING",
      expectedFiles: 0,
      generatedFiles: 0,
      validatedFiles: 0,
      message: "Job en cola",
      requestedByUserId: params.requestedByUserId,
    },
    select: { id: true },
  });

  void runRegeneracionArchivosJob(job.id);

  return { ok: true as const, jobId: job.id, reused: false };
}

export async function runRegeneracionArchivosJob(jobId: number) {
  const job = await prisma.liquidacionRegeneracionJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      liquidacionId: true,
      status: true,
    },
  });

  if (!job) {
    return;
  }

  if (job.status !== "PENDING") {
    return;
  }

  await prisma.liquidacionRegeneracionJob.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      stage: "PREPARING",
      startedAt: new Date(),
      message: "Preparando datos historicos...",
      errorDetail: null,
    },
  });

  try {
    const result = await regenerarArchivosLiquidacion(job.liquidacionId, {
      onProgress: async (progress) => {
        await prisma.liquidacionRegeneracionJob.update({
          where: { id: job.id },
          data: {
            status: progress.status,
            stage: progress.stage,
            message: progress.message,
            expectedFiles: progress.expectedFiles ?? 0,
            generatedFiles: progress.generatedFiles ?? 0,
            validatedFiles: progress.validatedFiles ?? 0,
          },
        });
      },
    });

    if (!result.ok) {
      await prisma.liquidacionRegeneracionJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          stage: "DONE",
          message: "No se pudo regenerar",
          errorDetail: result.reason,
          finishedAt: new Date(),
        },
      });
      return;
    }

    const activos = await prisma.liquidacionArchivo.count({
      where: {
        liquidacionId: job.liquidacionId,
        activo: true,
      },
    });

    if (activos !== result.expectedFiles || result.validatedFiles !== result.expectedFiles) {
      await prisma.liquidacionRegeneracionJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          stage: "DONE",
          message: "Validacion final incompleta",
          errorDetail: `esperados=${result.expectedFiles}, activos=${activos}, validados=${result.validatedFiles}`,
          expectedFiles: result.expectedFiles,
          generatedFiles: result.generatedFiles,
          validatedFiles: result.validatedFiles,
          finishedAt: new Date(),
        },
      });
      return;
    }

    await prisma.liquidacionRegeneracionJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        stage: "DONE",
        message: "Finalizado",
        expectedFiles: result.expectedFiles,
        generatedFiles: result.generatedFiles,
        validatedFiles: result.validatedFiles,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    const err = serializeError(error);

    await prisma.liquidacionRegeneracionJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        stage: "DONE",
        message: err.message,
        errorDetail: err.detail,
        finishedAt: new Date(),
      },
    });
  }
}


export async function startFinalizacionLiquidacionJob(params: {
  liquidacionId: number;
  requestedByUserId: string;
}) {
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: params.liquidacionId },
    select: {
      id: true,
      estado: true,
    },
  });

  if (!liquidacion) {
    return { ok: false as const, reason: "liquidacion_inexistente" };
  }

  if (liquidacion.estado === "FINALIZADA" || liquidacion.estado === "CERRADA") {
    return { ok: false as const, reason: "ya_finalizada" };
  }

  const runningOther = await prisma.liquidacionRegeneracionJob.findFirst({
    where: {
      liquidacionId: liquidacion.id,
      status: { in: ["PENDING", "RUNNING", "VALIDATING"] },
      tipo: { not: "FINALIZAR_LIQUIDACION" },
    },
    orderBy: { id: "desc" },
  });

  if (runningOther) {
    return { ok: false as const, reason: "proceso_en_curso" };
  }

  const existing = await prisma.liquidacionRegeneracionJob.findFirst({
    where: {
      liquidacionId: liquidacion.id,
      tipo: "FINALIZAR_LIQUIDACION",
      status: { in: ["PENDING", "RUNNING", "VALIDATING"] },
    },
    orderBy: { id: "desc" },
  });

  if (existing) {
    return { ok: true as const, jobId: existing.id, reused: true };
  }

  const job = await prisma.liquidacionRegeneracionJob.create({
    data: {
      liquidacionId: liquidacion.id,
      tipo: "FINALIZAR_LIQUIDACION",
      status: "PENDING",
      stage: "PREPARING",
      expectedFiles: 0,
      generatedFiles: 0,
      validatedFiles: 0,
      message: "Job en cola",
      requestedByUserId: params.requestedByUserId,
    },
    select: { id: true },
  });

  void runFinalizacionLiquidacionJob(job.id);

  return { ok: true as const, jobId: job.id, reused: false };
}

export async function runFinalizacionLiquidacionJob(jobId: number) {
  const job = await prisma.liquidacionRegeneracionJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      liquidacionId: true,
      status: true,
    },
  });

  if (!job || job.status !== "PENDING") {
    return;
  }

  await prisma.liquidacionRegeneracionJob.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      stage: "PREPARING",
      startedAt: new Date(),
      message: "Preparando liquidacion...",
      errorDetail: null,
    },
  });

  try {
    const result = await generarExpensasDefinitivasDesdePaso3(job.liquidacionId, {
      onProgress: async (progress) => {
        await prisma.liquidacionRegeneracionJob.update({
          where: { id: job.id },
          data: {
            status: progress.status,
            stage: progress.stage,
            message: progress.message,
            expectedFiles: progress.expectedFiles ?? 0,
            generatedFiles: progress.generatedFiles ?? 0,
            validatedFiles: progress.validatedFiles ?? 0,
          },
        });
      },
    });

    if (!result.ok) {
      await prisma.liquidacionRegeneracionJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          stage: "DONE",
          message: "No se pudo finalizar la liquidacion",
          errorDetail: result.reason,
          finishedAt: new Date(),
        },
      });
      return;
    }

    const liquidacionFinal = await prisma.liquidacion.findUnique({
      where: { id: job.liquidacionId },
      select: { estado: true },
    });

    const activos = await prisma.liquidacionArchivo.count({
      where: {
        liquidacionId: job.liquidacionId,
        activo: true,
      },
    });

    if (liquidacionFinal?.estado !== "FINALIZADA") {
      await prisma.liquidacionRegeneracionJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          stage: "DONE",
          message: "La liquidacion no quedo en estado FINALIZADA",
          errorDetail: `estado=${liquidacionFinal?.estado ?? "desconocido"}`,
          finishedAt: new Date(),
        },
      });
      return;
    }

    if (activos !== result.expectedFiles || result.validatedFiles !== result.expectedFiles) {
      await prisma.liquidacionRegeneracionJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          stage: "DONE",
          message: "Validacion final incompleta",
          errorDetail: `esperados=${result.expectedFiles}, activos=${activos}, validados=${result.validatedFiles}`,
          expectedFiles: result.expectedFiles,
          generatedFiles: result.generatedFiles,
          validatedFiles: result.validatedFiles,
          finishedAt: new Date(),
        },
      });
      return;
    }

    await prisma.liquidacionRegeneracionJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        stage: "DONE",
        message: result.emailSummary ? formatEmailSummary(result.emailSummary) : "Proceso completado",
        expectedFiles: result.expectedFiles,
        generatedFiles: result.generatedFiles,
        validatedFiles: result.validatedFiles,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    const err = serializeError(error);

    await prisma.liquidacionRegeneracionJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        stage: "DONE",
        message: err.message,
        errorDetail: err.detail,
        finishedAt: new Date(),
      },
    });
  }
}
