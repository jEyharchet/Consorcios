import { access } from "fs/promises";

import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

const DEFAULT_PUBLIC_APP_URL = "https://app.amiconsorcio.com.ar";
const DEFAULT_VIEWPORT = {
  deviceScaleFactor: 1,
  hasTouch: false,
  height: 1080,
  isLandscape: true,
  isMobile: false,
  width: 1920,
};

const LOCAL_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter((value): value is string => Boolean(value));

let cachedExecutablePath: string | null = null;

async function findFirstAccessiblePath(paths: string[]) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function getPublicAppUrl() {
  const baseUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    DEFAULT_PUBLIC_APP_URL;

  return baseUrl.replace(/\/+$/, "");
}

function getHostedChromiumPackUrl() {
  return `${getPublicAppUrl()}/chromium-pack.tar`;
}

async function resolveChromeExecutablePath() {
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

  if (isProduction) {
    if (cachedExecutablePath) {
      return cachedExecutablePath;
    }

    cachedExecutablePath = await chromium.executablePath(getHostedChromiumPackUrl());
    return cachedExecutablePath;
  }

  const localChrome = await findFirstAccessiblePath(LOCAL_CHROME_CANDIDATES);
  if (localChrome) {
    return localChrome;
  }

  throw new Error(
    "No se encontro una instalacion local de Chrome/Chromium. Configura PUPPETEER_EXECUTABLE_PATH o instala Chrome para desarrollo local.",
  );
}

export async function launchPdfBrowser() {
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const executablePath = await resolveChromeExecutablePath();

  if (isProduction) {
    return puppeteer.launch({
      args: puppeteer.defaultArgs({
        args: chromium.args,
        headless: "shell",
      }),
      defaultViewport: chromium.defaultViewport ?? DEFAULT_VIEWPORT,
      executablePath,
      headless: "shell",
    });
  }

  return puppeteer.launch({
    executablePath,
    headless: true,
  });
}
