import { launchPdfBrowser } from "./pdf-browser";

type ChromiumModule = {
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
  executablePath(): Promise<string>;
};

type PuppeteerCoreModule = {
  launch(input: {
    args?: string[];
    defaultViewport?: ChromiumModule["defaultViewport"];
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

async function loadChromium() {
  const mod = (await import(
    /* webpackIgnore: true */
    "@sparticuz/chromium"
  )) as ChromiumModule | { default: ChromiumModule };

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

  const [chromium, puppeteerCore] = await Promise.all([loadChromium(), loadPuppeteerCore()]);
  const browser = await puppeteerCore.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
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
