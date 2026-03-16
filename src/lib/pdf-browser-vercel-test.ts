import { launchPdfBrowser } from "./pdf-browser";

type ChromiumMinModule = {
  args: string[];
  defaultViewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    isLandscape?: boolean;
  } | null;
  executablePath(input?: string): Promise<string>;
};

type PuppeteerCoreModule = {
  defaultArgs(input?: { args?: string[]; headless?: boolean | "shell" }): string[];
  launch(input: {
    args?: string[];
    defaultViewport?: ChromiumMinModule["defaultViewport"];
    executablePath?: string;
    headless?: boolean | "shell";
  }): Promise<{
    newPage(): Promise<{
      setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
      pdf(options?: {
        format?: string;
        printBackground?: boolean;
        preferCSSPageSize?: boolean;
      }): Promise<Uint8Array>;
    }>;
    close(): Promise<void>;
  }>;
};

const DEFAULT_VIEWPORT = {
  deviceScaleFactor: 1,
  hasTouch: false,
  height: 1080,
  isLandscape: true,
  isMobile: false,
  width: 1920,
};

async function loadChromiumMin() {
  const mod = (await import(
    /* webpackIgnore: true */
    "@sparticuz/chromium-min"
  )) as ChromiumMinModule | { default: ChromiumMinModule };

  return "default" in mod ? mod.default : mod;
}

async function loadPuppeteerCore() {
  const mod = (await import(
    /* webpackIgnore: true */
    "puppeteer-core"
  )) as PuppeteerCoreModule | { default: PuppeteerCoreModule };

  return "default" in mod ? mod.default : mod;
}

export async function renderPdfWithVercelTestBrowser(html: string) {
  if (!process.env.VERCEL) {
    const browser = await launchPdfBrowser();

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
    } finally {
      await browser.close();
    }
  }

  const chromiumPackUrl = process.env.CHROMIUM_PACK_URL?.trim();
  if (!chromiumPackUrl) {
    throw new Error("CHROMIUM_PACK_URL no esta configurado");
  }

  const [chromium, puppeteerCore] = await Promise.all([loadChromiumMin(), loadPuppeteerCore()]);
  const executablePath = await chromium.executablePath(chromiumPackUrl);

  const browser = await puppeteerCore.launch({
    args: puppeteerCore.defaultArgs({
      args: chromium.args,
      headless: "shell",
    }),
    defaultViewport: chromium.defaultViewport ?? DEFAULT_VIEWPORT,
    executablePath,
    headless: "shell",
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
