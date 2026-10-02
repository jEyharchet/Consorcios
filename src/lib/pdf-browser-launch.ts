import { setTimeout as delay } from "node:timers/promises";

export function createExecutablePathResolver(extract: () => Promise<string>) {
  let pending: Promise<string> | undefined;
  return () => {
    if (!pending) {
      pending = extract().catch((error) => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
}

export async function launchWithBusyRetry<T>(
  launch: () => Promise<T>,
  wait: (ms: number) => Promise<unknown> = delay,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await launch();
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ETXTBSY" || attempt >= 3) {
        throw error;
      }
      await wait(250 * (attempt + 1));
    }
  }
}
