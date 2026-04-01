import { access, rm } from "fs/promises";
import path from "path";

import { prisma } from "./prisma";
import { getPeriodoVariants, normalizePeriodo } from "./periodo";
import { generarArchivosLiquidacion, getLiquidacionesUploadsBaseDir } from "./liquidacion-cierre";
import { enviarLiquidacionCerradaEmails } from "./liquidacion-email";
import { getAdministradorVigente } from "./consorcio-administradores";
import { buildEstadoCuentaDisplayByUnidad } from "./liquidacion-estado-cuenta-display";

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

function buildPeriodoBounds(periodo: string | null | undefined) {
  const normalized = normalizePeriodo(periodo ?? null);

  if (!normalized) {
    return null;
  }

  const [year, month] = normalized.split("-").map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  return { start, end };
}

function resolveFondoBucketKey(params: {
  tipoDestino: string;
  consorcioCuentaBancariaId: number | null;
}) {
  if (params.tipoDestino === "CAJA") {
    return "CAJA";
  }

  return `CUENTA:${params.consorcioCuentaBancariaId ?? "sin-id"}`;
}

function getFondosTotalAtBoundary(
  movimientos: Array<{
    fechaMovimiento: Date;
    tipoDestino: string;
    consorcioCuentaBancariaId: number | null;
    saldoAnterior: number;
    saldoPosterior: number;
  }>,
  boundary: Date,
) {
  const byBucket = new Map<string, typeof movimientos>();

  for (const movimiento of movimientos) {
    const key = resolveFondoBucketKey(movimiento);
    const current = byBucket.get(key) ?? [];
    current.push(movimiento);
    byBucket.set(key, current);
  }

  let total = 0;

  for (const bucketMovimientos of byBucket.values()) {
    const sorted = bucketMovimientos.sort((a, b) => a.fechaMovimiento.getTime() - b.fechaMovimiento.getTime());
    const previous = [...sorted].reverse().find((movimiento) => movimiento.fechaMovimiento < boundary);

    if (previous) {
      total += previous.saldoPosterior;
      continue;
    }

    const next = sorted.find((movimiento) => movimiento.fechaMovimiento >= boundary);
    if (next) {
      total += next.saldoAnterior;
    }
  }

  return total;
}

export async function getLiquidacionPaso4Data(liquidacionId: number) {
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    include: {
      consorcio: {
        select: {
          id: true,
          nombre: true,
          saldoCajaActual: true,
          cuit: true,
          direccion: true,
          ciudad: true,
          provincia: true,
          codigoPostal: true,
          tituloLegal: true,
          administradores: {
            orderBy: [{ desde: "desc" }, { id: "desc" }],
            select: {
              id: true,
              desde: true,
              hasta: true,
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
              saldoActual: true,
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

  const administradorVigente = getAdministradorVigente(liquidacion.consorcio.administradores);
  liquidacion.consorcio.administradores = administradorVigente
    ? [administradorVigente]
    : [];

  const periodoVariants = getPeriodoVariants(liquidacion.periodo);
  const periodoActualNormalizado = normalizePeriodo(liquidacion.periodo);
  const periodoActualBounds = buildPeriodoBounds(liquidacion.periodo);
  const useHistoricalGastos = liquidacion.estado === "FINALIZADA" || liquidacion.estado === "CERRADA";
  // Regeneracion historica: si existe snapshot de la cuenta usada en boletas, priorizarlo sobre datos vivos.
  const boletaCuentaSnapshot = parseBoletaCuentaSnapshot(liquidacion.boletaCuentaSnapshot);

  if (useHistoricalGastos && boletaCuentaSnapshot) {
    liquidacion.consorcio.cuentasBancarias = [boletaCuentaSnapshot] as typeof liquidacion.consorcio.cuentasBancarias;
  }

  const estadoCuentaDisplayByUnidad = await buildEstadoCuentaDisplayByUnidad({
    consorcioId: liquidacion.consorcioId,
    liquidacionId: liquidacion.id,
    periodo: liquidacion.periodo,
  });

  const liquidacionAnterior = periodoActualNormalizado
    ? await prisma.liquidacion.findFirst({
        where: {
          consorcioId: liquidacion.consorcioId,
          periodo: { lt: periodoActualNormalizado },
        },
        orderBy: [{ periodo: "desc" }, { id: "desc" }],
        select: {
          id: true,
          periodo: true,
        },
      })
    : null;

  const periodoAnteriorBounds = buildPeriodoBounds(liquidacionAnterior?.periodo);

  const [gastosFromSource, cobranzas, pagosGastoPeriodo, cobranzasPeriodoAnterior, pagosGastoPeriodoAnterior, movimientosFondo] = await Promise.all([
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
    prisma.pagoGasto.findMany({
      where: {
        consorcioId: liquidacion.consorcioId,
        gasto: {
          liquidacionId: liquidacion.id,
        },
        ...(periodoActualBounds
          ? {
              fechaPago: {
                gte: periodoActualBounds.start,
                lt: periodoActualBounds.end,
              },
            }
          : {}),
      },
      select: {
        id: true,
        monto: true,
        fechaPago: true,
        gasto: {
          select: {
            rubroExpensa: true,
          },
        },
      },
      orderBy: [{ fechaPago: "asc" }, { id: "asc" }],
    }),
    liquidacionAnterior
      ? prisma.pago.findMany({
          where: {
            expensa: {
              liquidacionId: liquidacionAnterior.id,
            },
            ...(periodoAnteriorBounds
              ? {
                  fechaPago: {
                    gte: periodoAnteriorBounds.start,
                    lt: periodoAnteriorBounds.end,
                  },
                }
              : {}),
          },
          select: {
            id: true,
            monto: true,
            fechaPago: true,
          },
          orderBy: [{ fechaPago: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
    liquidacionAnterior
      ? prisma.pagoGasto.findMany({
          where: {
            consorcioId: liquidacion.consorcioId,
            gasto: {
              liquidacionId: liquidacionAnterior.id,
            },
            ...(periodoAnteriorBounds
              ? {
                  fechaPago: {
                    gte: periodoAnteriorBounds.start,
                    lt: periodoAnteriorBounds.end,
                  },
                }
              : {}),
          },
          select: {
            id: true,
            monto: true,
            fechaPago: true,
            gasto: {
              select: {
                rubroExpensa: true,
              },
            },
          },
          orderBy: [{ fechaPago: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
    prisma.movimientoFondo.findMany({
      where: {
        consorcioId: liquidacion.consorcioId,
      },
      select: {
        id: true,
        fechaMovimiento: true,
        tipoDestino: true,
        consorcioCuentaBancariaId: true,
        saldoAnterior: true,
        saldoPosterior: true,
      },
      orderBy: [{ fechaMovimiento: "asc" }, { id: "asc" }],
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

  const totalEgresosParticulares = pagosGastoPeriodo
    .filter((pago) => pago.gasto.rubroExpensa.toLowerCase().includes("particular"))
    .reduce((acc, pago) => acc + pago.monto, 0);

  const totalEgresosPagados = pagosGastoPeriodo.reduce((acc, pago) => acc + pago.monto, 0);
  const totalEgresosGenerales = totalEgresosPagados - totalEgresosParticulares;
  const saldoCajaCierre =
    liquidacion.consorcio.saldoCajaActual +
    liquidacion.consorcio.cuentasBancarias.reduce((acc, cuenta) => acc + cuenta.saldoActual, 0);

  const totalCobradoAnterior = cobranzasPeriodoAnterior.reduce((acc, pago) => acc + pago.monto, 0);
  const totalEgresosParticularesAnterior = pagosGastoPeriodoAnterior
    .filter((pago) => pago.gasto.rubroExpensa.toLowerCase().includes("particular"))
    .reduce((acc, pago) => acc + pago.monto, 0);
  const totalEgresosPagadosAnterior = pagosGastoPeriodoAnterior.reduce((acc, pago) => acc + pago.monto, 0);
  const totalEgresosGeneralesAnterior = totalEgresosPagadosAnterior - totalEgresosParticularesAnterior;
  const cajaInicialPeriodoAnterior =
    liquidacionAnterior && periodoAnteriorBounds
      ? getFondosTotalAtBoundary(movimientosFondo, periodoAnteriorBounds.start)
      : 0;
  const saldoCajaPeriodoAnterior =
    cajaInicialPeriodoAnterior +
    totalCobradoAnterior -
    totalEgresosGeneralesAnterior -
    totalEgresosParticularesAnterior;

  const fondoTotal = liquidacion.montoFondoReserva ?? 0;

  const prorrateoRows = liquidacion.prorrateos.map((row) => {
    const fondoReserva = fondoTotal * row.coeficiente;
    const expensasDelMes = row.gastoOrdinario - fondoReserva;
    const display = estadoCuentaDisplayByUnidad.get(row.unidadId);

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
      saldoAnteriorDisplay: display?.saldoAnterior ?? row.saldoAnterior,
      pagosPeriodo: row.pagosPeriodo,
      pagosPeriodoDisplay: display?.pagosPeriodo ?? row.pagosPeriodo,
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
    pagosGastoPeriodo,
    totalGastos,
    totalCobranzas,
    resumenCaja: {
      cajaInicialPeriodoAnterior,
      ingresosPeriodoAnterior: totalCobradoAnterior,
      egresosPeriodoAnterior: totalEgresosGeneralesAnterior,
      egresosParticularesPeriodoAnterior: totalEgresosParticularesAnterior,
      saldoCajaPeriodoAnterior,
      egresosPeriodoActual: totalEgresosGenerales,
      egresosParticularesPeriodoActual: totalEgresosParticulares,
      saldoCajaActual: saldoCajaCierre,
    },
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
      ? resolveOutputRootFromRuta(archivosGenerados[0].rutaArchivo)
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
    ? resolveOutputRootFromRuta(archivosGenerados[0].rutaArchivo)
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



function resolveAbsolutePublicPathFromRuta(rutaArchivo: string) {
  const relative = rutaArchivo.replace(/^\/+/, "");
  if (!relative) {
    return null;
  }

  const liquidacionesPrefix = "uploads/liquidaciones/";
  if (relative.startsWith(liquidacionesPrefix)) {
    return path.join(
      getLiquidacionesUploadsBaseDir(),
      relative.slice(liquidacionesPrefix.length),
    );
  }

  return path.join(process.cwd(), "public", relative);
}

function resolveOutputRootFromRuta(rutaArchivo: string) {
  const absoluteFile = resolveAbsolutePublicPathFromRuta(rutaArchivo);
  if (!absoluteFile) {
    return null;
  }

  return path.dirname(absoluteFile);
}

async function assertGeneratedFilesExist(archivos: Array<{ rutaArchivo: string }>) {
  for (const archivo of archivos) {
    const absolute = resolveAbsolutePublicPathFromRuta(archivo.rutaArchivo);
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
          .map((a) => resolveOutputRootFromRuta(a.rutaArchivo))
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
          .map((a) => resolveOutputRootFromRuta(a.rutaArchivo))
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












