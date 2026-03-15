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
