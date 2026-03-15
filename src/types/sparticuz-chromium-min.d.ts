declare module "@sparticuz/chromium-min" {
  const chromium: {
    args: string[];
    defaultViewport?: {
      deviceScaleFactor: number;
      hasTouch: boolean;
      height: number;
      isLandscape: boolean;
      isMobile: boolean;
      width: number;
    };
    executablePath(input?: string): Promise<string>;
  };

  export default chromium;
}
