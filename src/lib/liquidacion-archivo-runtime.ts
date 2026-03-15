import { generarArchivosLiquidacion, type ArchivoGenerado } from "./liquidacion-cierre";
import { resolveExistingLiquidacionAbsolutePath, extractLiquidacionRelativeBase } from "./liquidacion-archivos";
import { getLiquidacionPaso4Data } from "./liquidacion-paso4";

type EnsureLiquidacionArchivoParams = {
  liquidacionId: number;
  rutaArchivo: string;
  tipoArchivo?: string | null;
  responsableGroupKey?: string | null;
  nombreArchivo?: string | null;
};

function normalizeTipoArchivo(tipoArchivo: string | null | undefined): ArchivoGenerado["tipoArchivo"] | null {
  if (tipoArchivo === "RENDICION" || tipoArchivo === "BOLETA_RESPONSABLE") {
    return tipoArchivo;
  }

  return null;
}

function pickGeneratedFile(
  archivos: ArchivoGenerado[],
  params: EnsureLiquidacionArchivoParams,
) {
  const tipoArchivo = normalizeTipoArchivo(params.tipoArchivo);

  return (
    archivos.find((archivo) => archivo.rutaArchivo === params.rutaArchivo) ??
    (tipoArchivo
      ? archivos.find(
          (archivo) =>
            archivo.tipoArchivo === tipoArchivo &&
            archivo.responsableGroupKey === (params.responsableGroupKey ?? null),
        )
      : null) ??
    (tipoArchivo === "RENDICION"
      ? archivos.find((archivo) => archivo.tipoArchivo === "RENDICION")
      : null) ??
    (params.nombreArchivo ? archivos.find((archivo) => archivo.nombreArchivo === params.nombreArchivo) : null) ??
    null
  );
}

export async function ensureLiquidacionArchivoAvailable(params: EnsureLiquidacionArchivoParams) {
  const existingPath = await resolveExistingLiquidacionAbsolutePath(params.rutaArchivo);
  if (existingPath) {
    return existingPath;
  }

  const relativeBase = extractLiquidacionRelativeBase(params.rutaArchivo);
  if (!relativeBase) {
    return null;
  }

  const data = await getLiquidacionPaso4Data(params.liquidacionId);
  if (!data) {
    return null;
  }

  const archivosGenerados = await generarArchivosLiquidacion(data, {
    relativeBase,
  });

  const matchedArchivo = pickGeneratedFile(archivosGenerados, params);
  if (!matchedArchivo) {
    return null;
  }

  return resolveExistingLiquidacionAbsolutePath(matchedArchivo.rutaArchivo);
}
