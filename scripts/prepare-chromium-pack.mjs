import { existsSync, mkdirSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const packageJson = await import(path.join(projectRoot, "package.json"), { with: { type: "json" } });

const chromiumVersion =
  packageJson.default?.dependencies?.["@sparticuz/chromium"]?.replace(/^[^\d]*/, "") ||
  packageJson.default?.dependencies?.["@sparticuz/chromium-min"]?.replace(/^[^\d]*/, "");

if (!chromiumVersion) {
  console.warn("[prepare-chromium-pack] Sparticuz version not found in package.json");
  process.exit(0);
}

const publicDir = path.join(projectRoot, "public");
const outputPath = path.join(publicDir, "chromium-pack.tar");
const releaseUrl =
  process.env.CHROMIUM_PACK_URL?.trim() ||
  `https://github.com/Sparticuz/chromium/releases/download/v${chromiumVersion}/chromium-v${chromiumVersion}-pack.tar`;

mkdirSync(publicDir, { recursive: true });

try {
  const existing = await stat(outputPath);
  if (existing.size > 0) {
    console.log(`[prepare-chromium-pack] Reusing existing ${outputPath}`);
    process.exit(0);
  }
} catch {
  // no-op
}

console.log(`[prepare-chromium-pack] Downloading ${releaseUrl}`);

const response = await fetch(releaseUrl);
if (!response.ok || !response.body) {
  throw new Error(`No se pudo descargar chromium pack (${response.status} ${response.statusText})`);
}

const fileBuffer = Buffer.from(await response.arrayBuffer());
await writeFile(outputPath, fileBuffer);

if (!existsSync(outputPath)) {
  throw new Error(`No se encontro ${outputPath} luego de la descarga`);
}

const downloaded = await stat(outputPath);
console.log(`[prepare-chromium-pack] Ready ${outputPath} (${downloaded.size} bytes)`);
