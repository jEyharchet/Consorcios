import { access } from "fs/promises";

import puppeteer from "puppeteer-core";

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

type ChromiumLikeModule = {
  args: string[];
  defaultViewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    isLandscape?: boolean;
  } | null;
  headless: boolean | "shell";
  executablePath: () => Promise<string>;
};

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

async function loadChromiumModule(): Promise<ChromiumLikeModule> {
  const mod = (await import(
    /* webpackIgnore: true */
    "@sparticuz/chromium"
  )) as ChromiumLikeModule | { default: ChromiumLikeModule };

  return "default" in mod ? mod.default : mod;
}

async function resolveChromeExecutablePath() {
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

  if (isProduction) {
    const chromium = await loadChromiumModule();
    return await chromium.executablePath();
  }

  const localChrome = await findFirstAccessiblePath(LOCAL_CHROME_CANDIDATES);
  if (localChrome) {
    return localChrome;
  }

  const chromium = await loadChromiumModule();
  return await chromium.executablePath();
}

export async function launchPdfBrowser() {
  const chromium = await loadChromiumModule();
  const executablePath = await resolveChromeExecutablePath();

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });
}
