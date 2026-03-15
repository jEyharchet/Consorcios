import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(projectRoot, "package.json");
const outputPath = path.join(projectRoot, "public", "chromium-pack.tar");

function normalizeVersion(versionRange) {
  return versionRange.replace(/^[^\d]*/, "").trim();
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await BunLike.readTextFile(packageJsonPath));
  const declaredVersion = packageJson.dependencies?.["@sparticuz/chromium-min"];

  if (!declaredVersion || typeof declaredVersion !== "string") {
    throw new Error("No se encontro la version de @sparticuz/chromium-min en package.json.");
  }

  return normalizeVersion(declaredVersion);
}

const BunLike = {
  async readTextFile(filePath) {
    const { readFile } = await import("fs/promises");
    return readFile(filePath, "utf8");
  },
};

async function downloadChromiumPack(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No se pudo descargar Chromium pack desde ${url}. status=${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function main() {
  const version = process.env.CHROMIUM_PACK_VERSION?.trim() || (await readPackageVersion());
  const arch = process.env.CHROMIUM_PACK_ARCH?.trim() || (process.arch === "arm64" ? "arm64" : "x64");
  const releaseUrl = `https://github.com/Sparticuz/chromium/releases/download/v${version}/chromium-v${version}-pack.${arch}.tar`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  const content = await downloadChromiumPack(releaseUrl);
  await writeFile(outputPath, content);

  console.log(`[prepare-chromium-pack] downloaded ${releaseUrl} -> ${outputPath}`);
}

main().catch((error) => {
  console.error("[prepare-chromium-pack] failed", error);
  process.exit(1);
});
