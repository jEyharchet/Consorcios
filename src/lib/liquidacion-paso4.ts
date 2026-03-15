import { access, rm } from "fs/promises";

import { prisma } from "./prisma";
import { getPeriodoVariants } from "./periodo";
import {
  resolveExistingLiquidacionAbsolutePath,
  resolveLiquidacionAbsolutePathFromRuta,
  resolveLiquidacionOutputRootFromRuta,
} from "./liquidacion-archivos";
import { generarArchivosLiquidacion } from "./liquidacion-cierre";
import { enviarLiquidacionCerradaEmails } from "./liquidacion-email";

type OwnerRel = {
  desde: Date;
  hasta: Date | null;
  persona: { id: number; nombre: string; apellido: string };
};

type OwnerProfile = {
  id: number;
  label: string;
};
type BoletaCuentaSnapshot = {
  banco: string;
  titular: string;
  cbu: string;
  alias: string | null;
  cuitTitular: string | null;
  esCuentaExpensas: true;
  activa: true;
  qrEnabled: boolean;
  qrMode: string | null;
  qrPayloadTemplate: string | null;
  qrLabel: string | null;
  qrExperimental: boolean;
};

function buildBoletaCuentaSnapshot(
  cuentas: Array<{
    banco: string;
    titular: string;
    cbu: string;
    alias: string | null;
    cuitTitular: string | null;
    esCuentaExpensas: boolean;
    activa: boolean;
    qrEnabled: boolean;
    qrMode: string | null;
    qrPayloadTemplate: string | null;
    qrLabel: string | null;
    qrExperimental: boolean;
  }>,
) {
  const cuentaExpensas = cuentas.find((cuenta) => cuenta.esCuentaExpensas);
  if (!cuentaExpensas) {
    return null;
  }

  return JSON.stringify({
    banco: cuentaExpensas.banco,
    titular: cuentaExpensas.titular,
    cbu: cuentaExpensas.cbu,
    alias: cuentaExpensas.alias ?? null,
    cuitTitular: cuentaExpensas.cuitTitular ?? null,
    esCuentaExpensas: true,
    activa: true,
    qrEnabled: Boolean(cuentaExpensas.qrEnabled),
    qrMode: cuentaExpensas.qrMode ?? null,
    qrPayloadTemplate: cuentaExpensas.qrPayloadTemplate ?? null,
    qrLabel: cuentaExpensas.qrLabel ?? null,
    qrExperimental: Boolean(cuentaExpensas.qrExperimental),
  } satisfies BoletaCuentaSnapshot);
}

function parseBoletaCuentaSnapshot(snapshot: string | null | undefined): BoletaCuentaSnapshot | null {
  if (!snapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(snapshot) as Partial<BoletaCuentaSnapshot>;
    if (!parsed || typeof parsed.banco !== "string" || typeof parsed.titular !== "string" || typeof parsed.cbu !== "string") {
      return null;
    }

    return {
      banco: parsed.banco,
      titular: parsed.titular,
      cbu: parsed.cbu,
      alias: parsed.alias ?? null,
      cuitTitular: parsed.cuitTitular ?? null,
      esCuentaExpensas: true,
      activa: true,
      qrEnabled: Boolean(parsed.qrEnabled),
      qrMode: parsed.qrMode ?? null,
      qrPayloadTemplate: parsed.qrPayloadTemplate ?? null,
      qrLabel: parsed.qrLabel ?? null,
      qrExperimental: Boolean(parsed.qrExperimental),
    };
  } catch {
    return null;
  }
}

function getOwnerProfiles(relaciones: OwnerRel[]): OwnerProfile[] {
  if (relaciones.length === 0) {
    return [{ id: 0, label: "-" }];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const vigentes = relaciones.filter((r) => r.desde <= today && (!r.hasta || r.hasta >= today));
  const base = vigentes.length > 0 ? vigentes : [relaciones[0]];

  const uniqueById = new Map<number, OwnerProfile>();
  for (const rel of base) {
    uniqueById.set(rel.persona.id, {
      id: rel.persona.id,
      label: `${rel.persona.apellido}, ${rel.persona.nombre}`,
    });
  }

  return Array.from(uniqueById.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function getOwnerLabels(relaciones: OwnerRel[]) {
  return getOwnerProfiles(relaciones).map((p) => p.label);
}

function getOwnerLabel(relaciones: OwnerRel[]) {
  return getOwnerLabels(relaciones)[0] ?? "-";
}

function formatUnidadTipo(tipo: string) {
  const lower = tipo.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function buildUbicacionLabel(unidad: {
  identificador: string;
  tipo: string;
  piso: string | null;
  departamento: string | null;
}) {
  const tipoLabel = formatUnidadTipo(unidad.tipo);
  const referencia = unidad.departamento?.trim() || unidad.identificador;
  const unidadLabel = `${tipoLabel} ${referencia}`;

  if (unidad.piso) {
    return `Piso ${unidad.piso} / ${unidadLabel}`;
  }

  return unidadLabel;
}

export async function getLiquidacionPaso4Data(liquidacionId: number) {
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    include: {
      consorcio: {
        select: {
          id: true,
          nombre: true,
          cuit: true,
          direccion: true,
          ciudad: true,
          provincia: true,
          codigoPostal: true,
          tituloLegal: true,
          administradores: {
            where: { hasta: null },
            orderBy: [{ desde: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              persona: {
                select: {
                  nombre: true,
                  apellido: true,
                  telefono: true,
                  email: true,
                },
              },
            },
          },
          cuentasBancarias: {
            where: { activa: true },
            orderBy: [{ esCuentaExpensas: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              banco: true,
              titular: true,
              cbu: true,
              alias: true,
              cuitTitular: true,
              esCuentaExpensas: true,
              activa: true,
              qrEnabled: true,
              qrMode: true,
              qrPayloadTemplate: true,
              qrLabel: true,
              qrExperimental: true,
            },
          },
        },
      },
      prorrateos: {
        include: {
          unidad: {
            select: {
              id: true,
              identificador: true,
              tipo: true,
              piso: true,
              departamento: true,
              personas: {
                include: {
                  persona: { select: { id: true, nombre: true, apellido: true } },
                },
                orderBy: [{ desde: "desc" }, { persona: { apellido: "asc" } }],
              },
            },
          },
        },
        orderBy: [{ unidad: { identificador: "asc" } }, { unidadId: "asc" }],
      },
      archivos: {
        where: { activo: true },
        orderBy: [{ tipoArchivo: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!liquidacion) {
    return null;
  }

  const periodoVariants = getPeriodoVariants(liquidacion.periodo);
  const useHistoricalGastos = liquidacion.estado === "FINALIZADA" || liquidacion.estado === "CERRADA";
  // Regeneracion historica: si existe snapshot de la cuenta usada en boletas, priorizarlo sobre datos vivos.
  const boletaCuentaSnapshot = parseBoletaCuentaSnapshot(liquidacion.boletaCuentaSnapshot);

  if (useHistoricalGastos && boletaCuentaSnapshot) {
    liquidacion.consorcio.cuentasBancarias = [boletaCuentaSnapshot] as typeof liquidacion.consorcio.cuentasBancarias;
  }

  const [gastosFromSource, cobranzas] = await Promise.all([
    useHistoricalGastos
      ? prisma.liquidacionGastoHistorico.findMany({
          where: { liquidacionId: liquidacion.id },
          orderBy: [{ fecha: "asc" }, { id: "asc" }],
        })
      : prisma.gasto.findMany({
          where: {
            consorcioId: liquidacion.consorcioId,
            periodo: { in: periodoVariants },
          },
          include: {
            proveedor: { select: { nombre: true } },
          },
          orderBy: [{ fecha: "asc" }, { id: "asc" }],
        }),
    prisma.pago.findMany({
      where: {
        expensa: {
          liquidacionId: liquidacion.id,
        },
      },
      select: {
        id: true,
        monto: true,
        fechaPago: true,
        medioPago: true,
      },
      orderBy: [{ fechaPago: "asc" }, { id: "asc" }],
    }),
  ]);

  const gastos = useHistoricalGastos
    ? gastosFromSource.map((g) => ({
        id: g.id,
        fecha: g.fecha,
        periodo: g.periodo,
        concepto: g.concepto,
        descripcion: g.descripcion,
        tipoExpensa: g.tipoExpensa,
        rubroExpensa: g.rubroExpensa,
        monto: g.monto,
        proveedor: "proveedorNombre" in g
          ? (g.proveedorNombre ? { nombre: g.proveedorNombre } : null)
          : (g.proveedor ?? null),
      }))
    : gastosFromSource.map((g) => ({
        id: g.id,
        fecha: g.fecha,
        periodo: g.periodo,
        concepto: g.concepto,
        descripcion: g.descripcion,
        tipoExpensa: g.tipoExpensa,
        rubroExpensa: g.rubroExpensa,
        monto: g.monto,
        proveedor:
          "proveedorNombre" in g
            ? g.proveedorNombre
              ? { nombre: g.proveedorNombre }
              : null
            : g.proveedor?.nombre
              ? { nombre: g.proveedor.nombre }
              : null,
      }));

  const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0);
  const totalCobranzas = cobranzas.reduce((acc, c) => acc + c.monto, 0);

  const fondoTotal = liquidacion.montoFondoReserva ?? 0;

  const prorrateoRows = liquidacion.prorrateos.map((row) => {
    const fondoReserva = fondoTotal * row.coeficiente;
    const expensasDelMes = row.gastoOrdinario - fondoReserva;

    return {
      unidadId: row.unidadId,
      uf: row.unidad.identificador,
      ubicacion: buildUbicacionLabel(row.unidad),
      piso: row.unidad.piso,
      departamento: row.unidad.departamento,
      propietario: getOwnerLabel(row.unidad.personas),
      propietarios: getOwnerLabels(row.unidad.personas),
      propietariosInfo: getOwnerProfiles(row.unidad.personas),
      coeficiente: row.coeficiente,
      saldoAnterior: row.saldoAnterior,
      pagosPeriodo: row.pagosPeriodo,
      saldoDeudor: row.saldoDeudor,
      expensasDelMes,
      fondoReserva,
      intereses: row.intereses,
      ajuste: row.redondeo,
      total: row.total,
      gastoOrdinario: row.gastoOrdinario,
      redondeo: row.redondeo,
    };
  });

  const morosos = prorrateoRows
    .filter((r) => r.total > 0)
    .map((r) => ({ unidad: `${r.uf} - ${r.ubicacion}`, propietario: r.propietario, saldo: r.total }));

  const proveedores = gastos
    .filter((g) => g.proveedor)
    .map((g) => ({
      proveedor: g.proveedor?.nombre ?? "-",
      concepto: g.concepto,
      montoPagado: g.monto,
    }));

  const historicalGastosMissing =
    useHistoricalGastos &&
    gastos.length === 0 &&
    ((liquidacion.montoOrdinarias ?? 0) > 0 || (liquidacion.montoExtraordinarias ?? 0) > 0);

  return {
    liquidacion,
    gastos,
    cobranzas,
    totalGastos,
    totalCobranzas,
    prorrateoRows,
    morosos,
    proveedores,
    historicalGastosMissing,
  };
}

export async function generarExpensasDefinitivasDesdePaso3(
  liquidacionId: number,
  options?: { onProgress?: (event: RegeneracionProgress) => void | Promise<void> },
) {
  const notify = async (event: RegeneracionProgress) => {
    if (options?.onProgress) {
      await options.onProgress(event);
    }
  };

  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    select: {
      id: true,
      estado: true,
      prorrateos: {
        select: {
          unidadId: true,
          total: true,
        },
      },
    },
  });

  if (!liquidacion) {
    return { ok: false as const, reason: "liquidacion_inexistente" };
  }

  if (liquidacion.estado === "FINALIZADA" || liquidacion.estado === "CERRADA") {
    return { ok: false as const, reason: "ya_finalizada" };
  }

  if (liquidacion.prorrateos.length === 0) {
    return { ok: false as const, reason: "sin_prorrateo" };
  }

  const existingExpensas = await prisma.expensa.findMany({
    where: { liquidacionId: liquidacion.id },
    select: {
      id: true,
      estado: true,
      pagos: { select: { id: true } },
    },
  });

  if (existingExpensas.some((e) => e.pagos.length > 0)) {
    return { ok: false as const, reason: "expensas_con_cobranzas" };
  }

  if (existingExpensas.some((e) => e.estado !== "PENDIENTE")) {
    return { ok: false as const, reason: "expensas_no_editables" };
  }

  await notify({
    status: "RUNNING",
    stage: "PREPARING",
    message: "Preparando liquidacion...",
    expectedFiles: 0,
    generatedFiles: 0,
    validatedFiles: 0,
  });

  const data = await getLiquidacionPaso4Data(liquidacion.id);
  if (!data) {
    return { ok: false as const, reason: "liquidacion_inexistente" };
  }

  const archivosGenerados = await generarArchivosLiquidacion(data, {
    onProgress: async (progress) => {
      await notify({
        status: "RUNNING",
        stage: progress.stage,
        message:
          progress.stage === "GENERATING_RENDICION"
            ? "Generando rendicion PDF..."
            : "Generando volantes / boletas...",
        expectedFiles: progress.expectedFiles,
        generatedFiles: progress.generatedFiles,
        validatedFiles: 0,
      });
    },
  });

  await notify({
    status: "VALIDATING",
    stage: "VERIFYING_FILES",
    message: "Validando archivos...",
    expectedFiles: archivosGenerados.length,
    generatedFiles: archivosGenerados.length,
    validatedFiles: 0,
  });

  try {
    await assertGeneratedFilesExist(archivosGenerados);
  } catch (error) {
    const outputRootOnValidationError = archivosGenerados[0]?.rutaArchivo
      ? resolveLiquidacionOutputRootFromRuta(archivosGenerados[0].rutaArchivo)
      : null;

    if (outputRootOnValidationError) {
      await rm(outputRootOnValidationError, { recursive: true, force: true });
    }

    throw error;
  }

  const expensasData = liquidacion.prorrateos.map((row) => ({
    liquidacionId: liquidacion.id,
    unidadId: row.unidadId,
    monto: row.total,
    saldo: row.total,
    estado: "PENDIENTE",
  }));

  const outputRoot = archivosGenerados[0]?.rutaArchivo
    ? resolveLiquidacionOutputRootFromRuta(archivosGenerados[0].rutaArchivo)
    : null;

  try {
    await notify({
      status: "RUNNING",
      stage: "ACTIVATING_FILES",
      message: "Finalizando liquidacion...",
      expectedFiles: archivosGenerados.length,
      generatedFiles: archivosGenerados.length,
      validatedFiles: archivosGenerados.length,
    });

    await prisma.$transaction(async (tx) => {
      await tx.expensa.deleteMany({ where: { liquidacionId: liquidacion.id } });

      await tx.expensa.createMany({ data: expensasData });

      const total = liquidacion.prorrateos.reduce((acc, row) => acc + row.total, 0);

      await tx.liquidacionGastoHistorico.deleteMany({
        where: { liquidacionId: liquidacion.id },
      });

      if (data.gastos.length > 0) {
        await tx.liquidacionGastoHistorico.createMany({
          data: data.gastos.map((g) => ({
            liquidacionId: liquidacion.id,
            gastoOrigenId: g.id,
            fecha: g.fecha,
            periodo: g.periodo,
            concepto: g.concepto,
            descripcion: g.descripcion,
            tipoExpensa: g.tipoExpensa,
            rubroExpensa: g.rubroExpensa,
            monto: g.monto,
            proveedorNombre: g.proveedor?.nombre ?? null,
          })),
        });
      }

      await tx.liquidacion.update({
        where: { id: liquidacion.id },
        data: {
          total,
          estado: "FINALIZADA",
          wizardPasoActual: 4,
          boletaCuentaSnapshot: buildBoletaCuentaSnapshot(data.liquidacion.consorcio.cuentasBancarias),
        },
      });

      await tx.liquidacionArchivo.updateMany({
        where: { liquidacionId: liquidacion.id, activo: true },
        data: { activo: false, reemplazadoAt: new Date() },
      });
      await tx.liquidacionArchivo.createMany({
        data: archivosGenerados.map((a) => ({
          liquidacionId: liquidacion.id,
          tipoArchivo: a.tipoArchivo,
          nombreArchivo: a.nombreArchivo,
          rutaArchivo: a.rutaArchivo,
          mimeType: "application/pdf",
          responsableGroupKey: a.responsableGroupKey,
          activo: true,
        })),
      });
    });
  } catch (error) {
    if (outputRoot) {
      await rm(outputRoot, { recursive: true, force: true });
    }
    throw error;
  }

  await notify({
    status: "COMPLETED",
    stage: "DONE",
    message: "Proceso completado",
    expectedFiles: archivosGenerados.length,
    generatedFiles: archivosGenerados.length,
    validatedFiles: archivosGenerados.length,
  });

  const emailSummary = await enviarLiquidacionCerradaEmails(liquidacion.id);

  return {
    ok: true as const,
    archivos: archivosGenerados,
    expectedFiles: archivosGenerados.length,
    generatedFiles: archivosGenerados.length,
    validatedFiles: archivosGenerados.length,
    emailSummary,
  };
}



async function assertGeneratedFilesExist(archivos: Array<{ rutaArchivo: string }>) {
  for (const archivo of archivos) {
    const absolute =
      resolveLiquidacionAbsolutePathFromRuta(archivo.rutaArchivo) ??
      (await resolveExistingLiquidacionAbsolutePath(archivo.rutaArchivo));
    if (!absolute) {
      throw new Error(`Ruta de archivo invalida: ${archivo.rutaArchivo}`);
    }

    await access(absolute);
  }
}

type RegeneracionStage =
  | "PREPARING"
  | "GENERATING_RENDICION"
  | "GENERATING_BOLETAS"
  | "VERIFYING_FILES"
  | "ACTIVATING_FILES"
  | "DONE";

type RegeneracionStatus = "PENDING" | "RUNNING" | "VALIDATING" | "COMPLETED" | "FAILED";

type RegeneracionProgress = {
  status: RegeneracionStatus;
  stage: RegeneracionStage;
  message: string;
  expectedFiles?: number;
  generatedFiles?: number;
  validatedFiles?: number;
};

function countResponsableGroupsForBoletas(rows: Array<{
  propietariosInfo?: Array<{ id: number; label: string }>;
  propietarios?: string[];
  propietario?: string;
}>) {
  const groups = new Set<string>();

  for (const row of rows) {
    if (row.propietariosInfo && row.propietariosInfo.length > 0) {
      const key = row.propietariosInfo
        .map((p) => p.id)
        .sort((a, b) => a - b)
        .join("|");
      groups.add(key);
      continue;
    }

    const labels = row.propietarios && row.propietarios.length > 0 ? row.propietarios : [row.propietario ?? "Sin responsable"];
    const fallbackKey = `fallback-${labels.slice().sort((a, b) => a.localeCompare(b, "es")).join("|")}`;
    groups.add(fallbackKey);
  }

  return groups.size;
}

export async function regenerarArchivosLiquidacion(
  liquidacionId: number,
  options?: { onProgress?: (event: RegeneracionProgress) => void | Promise<void> },
) {
  const notify = async (event: RegeneracionProgress) => {
    if (options?.onProgress) {
      await options.onProgress(event);
    }
  };

  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    select: {
      id: true,
      consorcioId: true,
      estado: true,
      archivos: {
        where: { activo: true },
        select: { id: true, rutaArchivo: true },
      },
    },
  });

  if (!liquidacion) {
    return { ok: false as const, reason: "liquidacion_inexistente" };
  }

  if (liquidacion.estado !== "FINALIZADA" && liquidacion.estado !== "CERRADA") {
    return { ok: false as const, reason: "estado_no_regenerable" };
  }

  await notify({
    status: "RUNNING",
    stage: "PREPARING",
    message: "Preparando datos historicos...",
    expectedFiles: 0,
    generatedFiles: 0,
    validatedFiles: 0,
  });

  const data = await getLiquidacionPaso4Data(liquidacion.id);
  if (!data) {
    return { ok: false as const, reason: "liquidacion_inexistente" };
  }

  if (data.historicalGastosMissing) {
    return { ok: false as const, reason: "sin_snapshot_gastos_historicos" };
  }

  const expectedFiles = 1 + countResponsableGroupsForBoletas(data.prorrateoRows);
  let generatedFiles = 0;
  let validatedFiles = 0;

  const archivosGenerados = await generarArchivosLiquidacion(data, {
    onProgress: async (progress) => {
      generatedFiles = progress.generatedFiles;
      await notify({
        status: "RUNNING",
        stage: progress.stage,
        message:
          progress.stage === "GENERATING_RENDICION"
            ? "Generando rendicion PDF..."
            : "Generando boletas PDF...",
        expectedFiles: progress.expectedFiles,
        generatedFiles: progress.generatedFiles,
        validatedFiles,
      });
    },
  });

  try {
    await notify({
      status: "VALIDATING",
      stage: "VERIFYING_FILES",
      message: "Validando archivos generados...",
      expectedFiles,
      generatedFiles: archivosGenerados.length,
      validatedFiles,
    });

    await assertGeneratedFilesExist(archivosGenerados);
    validatedFiles = archivosGenerados.length;
  } catch (error) {
    const newRoots = Array.from(
      new Set(
        archivosGenerados
          .map((a) => resolveLiquidacionOutputRootFromRuta(a.rutaArchivo))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    await Promise.all(newRoots.map((root) => rm(root, { recursive: true, force: true })));
    throw error;
  }

  try {
    await notify({
      status: "RUNNING",
      stage: "ACTIVATING_FILES",
      message: "Activando archivos nuevos...",
      expectedFiles,
      generatedFiles: generatedFiles || archivosGenerados.length,
      validatedFiles,
    });

    const previousActiveIds = liquidacion.archivos.map((a) => a.id);

    await prisma.$transaction(async (tx) => {
      await tx.liquidacionArchivo.createMany({
        data: archivosGenerados.map((a) => ({
          liquidacionId: liquidacion.id,
          tipoArchivo: a.tipoArchivo,
          nombreArchivo: a.nombreArchivo,
          rutaArchivo: a.rutaArchivo,
          mimeType: "application/pdf",
          responsableGroupKey: a.responsableGroupKey,
          activo: true,
        })),
      });

      if (previousActiveIds.length > 0) {
        await tx.liquidacionArchivo.updateMany({
          where: { id: { in: previousActiveIds } },
          data: { activo: false, reemplazadoAt: new Date() },
        });
      }
    });
  } catch (error) {
    const newRoots = Array.from(
      new Set(
        archivosGenerados
          .map((a) => resolveLiquidacionOutputRootFromRuta(a.rutaArchivo))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    await Promise.all(newRoots.map((root) => rm(root, { recursive: true, force: true })));
    throw error;
  }

  await notify({
    status: "COMPLETED",
    stage: "DONE",
    message: "Finalizado",
    expectedFiles,
    generatedFiles: archivosGenerados.length,
    validatedFiles,
  });

  return {
    ok: true as const,
    archivos: archivosGenerados,
    expectedFiles,
    generatedFiles: archivosGenerados.length,
    validatedFiles,
  };
}












