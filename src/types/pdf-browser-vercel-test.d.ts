declare module "@sparticuz/chromium-min" {
  const chromium: {
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

  export default chromium;
}

declare module "puppeteer-core" {
  const puppeteerCore: {
    defaultArgs(input?: { args?: string[]; headless?: boolean | "shell" }): string[];
    launch(input: {
      args?: string[];
      defaultViewport?: {
        width: number;
        height: number;
        deviceScaleFactor?: number;
        isMobile?: boolean;
        hasTouch?: boolean;
        isLandscape?: boolean;
      } | null;
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

  export default puppeteerCore;
}
