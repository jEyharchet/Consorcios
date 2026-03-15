import puppeteer from "puppeteer";

export async function launchPdfBrowser() {
  return puppeteer.launch({
    args: process.env.VERCEL ? ["--no-sandbox", "--disable-setuid-sandbox"] : undefined,
    headless: true,
  });
}
