import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";
import puppeteer from "puppeteer";
import { createExecutablePathResolver, launchWithBusyRetry } from "./pdf-browser-launch";

const pdfRuntime = globalThis as typeof globalThis & {
  consorciosChromiumPath?: () => Promise<string>;
};

// Concurrent requests in a warm instance must await the same extraction.
const resolveChromiumPath = pdfRuntime.consorciosChromiumPath ??=
  createExecutablePathResolver(() => chromium.executablePath());

export async function launchPdfBrowser() {
  if (process.env.VERCEL === "1") {
    const executablePath = await resolveChromiumPath();
    return launchWithBusyRetry(() => puppeteerCore.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      executablePath,
      headless: true,
    }));
  }

  return puppeteer.launch({
    headless: true,
  });
}
