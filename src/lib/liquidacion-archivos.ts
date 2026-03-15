import path from "path";
import { access } from "fs/promises";

const LIQUIDACION_PUBLIC_PREFIX = "/uploads/liquidaciones";

function normalizeRutaArchivo(rutaArchivo: string) {
  const normalized = rutaArchivo.startsWith("/") ? rutaArchivo : `/${rutaArchivo}`;
  return normalized.replace(/\\/g, "/");
}

function getVercelLiquidacionesDir() {
  return path.join("/tmp", "liquidaciones");
}

function getLocalLiquidacionesDir() {
  return path.join(process.cwd(), "public", "uploads", "liquidaciones");
}

export function getLiquidacionStorageDir() {
  return process.env.VERCEL ? getVercelLiquidacionesDir() : getLocalLiquidacionesDir();
}

export function buildLiquidacionRelativeBase(liquidacionId: number, timestamp: string) {
  return `${LIQUIDACION_PUBLIC_PREFIX}/liquidacion-${liquidacionId}-${timestamp}`;
}

export function extractLiquidacionRelativeBase(rutaArchivo: string) {
  const normalized = normalizeRutaArchivo(rutaArchivo);
  if (!isLiquidacionUploadRuta(normalized)) {
    return null;
  }

  const lastSlashIndex = normalized.lastIndexOf("/");
  if (lastSlashIndex <= LIQUIDACION_PUBLIC_PREFIX.length) {
    return null;
  }

  return normalized.slice(0, lastSlashIndex);
}

export function isLiquidacionUploadRuta(rutaArchivo: string) {
  return normalizeRutaArchivo(rutaArchivo).startsWith(`${LIQUIDACION_PUBLIC_PREFIX}/`);
}

export function resolveLiquidacionAbsolutePathFromRuta(rutaArchivo: string) {
  const normalized = normalizeRutaArchivo(rutaArchivo);
  if (!isLiquidacionUploadRuta(normalized)) {
    return null;
  }

  const relative = normalized.slice(`${LIQUIDACION_PUBLIC_PREFIX}/`.length);
  if (!relative || relative.includes("..")) {
    return null;
  }

  return path.join(getLiquidacionStorageDir(), relative);
}

export function resolveLiquidacionOutputRootFromRuta(rutaArchivo: string) {
  const absoluteFile = resolveLiquidacionAbsolutePathFromRuta(rutaArchivo);
  return absoluteFile ? path.dirname(absoluteFile) : null;
}

export async function resolveExistingLiquidacionAbsolutePath(rutaArchivo: string) {
  const normalized = normalizeRutaArchivo(rutaArchivo);
  if (!isLiquidacionUploadRuta(normalized)) {
    return null;
  }

  const relative = normalized.slice(`${LIQUIDACION_PUBLIC_PREFIX}/`.length);
  if (!relative || relative.includes("..")) {
    return null;
  }

  const candidates = Array.from(
    new Set(
      [getLiquidacionStorageDir(), getLocalLiquidacionesDir(), getVercelLiquidacionesDir()].map((baseDir) =>
        path.join(baseDir, relative),
      ),
    ),
  );

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return null;
}
