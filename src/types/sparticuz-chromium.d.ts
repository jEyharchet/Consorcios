declare module "@sparticuz/chromium" {
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
    headless: boolean | "shell";
    executablePath(): Promise<string>;
  };

  export default chromium;
}
