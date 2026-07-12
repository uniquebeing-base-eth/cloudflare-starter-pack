const FARCASTER_SDK_URL = "https://esm.sh/@farcaster/miniapp-sdk@0.3.0";
let farcasterReadyPromise: Promise<boolean> | null = null;

async function loadFarcasterSdk(): Promise<unknown> {
  if (typeof window === "undefined") {
    throw new Error("farcaster-sdk-window-only");
  }

  const mod = await import(/* @vite-ignore */ FARCASTER_SDK_URL);
  return (mod as { sdk?: unknown; default?: unknown }).sdk ??
    (mod as { default?: unknown }).default;
}

export async function initializeFarcasterMiniApp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (farcasterReadyPromise) return farcasterReadyPromise;

  farcasterReadyPromise = (async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const sdk = await loadFarcasterSdk();

        if (!sdk || typeof sdk !== "object") {
          throw new Error("sdk-unavailable");
        }

        const ready = (sdk as {
          actions?: { ready?: (options?: Record<string, unknown>) => unknown };
          ready?: (options?: Record<string, unknown>) => unknown;
        }).actions?.ready ?? (sdk as { ready?: (options?: Record<string, unknown>) => unknown }).ready;

        if (typeof ready !== "function") {
          throw new Error("ready-unavailable");
        }

        await ready();
        return true;
      } catch {
        if (attempt === 7) break;
        await new Promise((resolve) => window.setTimeout(resolve, 200 + attempt * 200));
      }
    }

    return false;
  })();

  return farcasterReadyPromise;
}
