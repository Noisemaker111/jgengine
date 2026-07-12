/**
 * Shoot handshake: page marks an honest frame with a tiny status on
 * documentElement + a ≤1KB console line. The host pulls pixels via CDP
 * Page.captureScreenshot — never ships PNG/base64 through the page.
 */

export type CaptureStatus = "preparing" | "ready" | "error";

export interface CaptureMeta {
  v: 1;
  status: CaptureStatus;
  game: string;
  mode: string;
  device: string;
  cssWidth: number;
  cssHeight: number;
  error?: string;
}

const CAPTURE_CONSOLE = "[jgengine:capture]";

export function captureArmed(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("capture") === "1";
}

export function readCaptureQuery(): { game: string; mode: string; device: string; settle: number | null } {
  const params = new URLSearchParams(window.location.search);
  const settleRaw = params.get("settle");
  const settle = settleRaw === null ? null : Number.parseInt(settleRaw, 10);
  return {
    game: params.get("game") ?? "demo",
    mode: params.get("mode") ?? "play",
    device: params.get("device") ?? "desktop",
    settle: settle !== null && Number.isFinite(settle) ? settle : null,
  };
}

export function setCaptureStatus(status: CaptureStatus, error?: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.jgCapture = status;
  if (error !== undefined && error.length > 0) {
    document.documentElement.dataset.jgCaptureError = error.slice(0, 500);
  } else {
    delete document.documentElement.dataset.jgCaptureError;
  }
  const q = readCaptureQuery();
  const meta: CaptureMeta = {
    v: 1,
    status,
    game: q.game,
    mode: q.mode,
    device: q.device,
    cssWidth: window.innerWidth,
    cssHeight: window.innerHeight,
    ...(error !== undefined && error.length > 0 ? { error: error.slice(0, 200) } : {}),
  };
  console.debug(CAPTURE_CONSOLE, JSON.stringify(meta));
}

function waitForSelector(selector: string, timeoutMs: number): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing !== null) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found !== null) {
        observer.disconnect();
        window.clearTimeout(timer);
        resolve(found);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`timed out waiting for ${selector}`));
    }, timeoutMs);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitPlayFrames(settleMs: number): Promise<void> {
  await waitForSelector("canvas, [data-jg-frame-ready]", 25_000);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
  await delay(settleMs);
}

/**
 * When `?capture=1`, marks preparing → ready|error once the runner has an
 * honest frame for the active mode. Host polls `data-jg-capture` / console.
 */
export function armCaptureReady(mode: string): () => void {
  if (!captureArmed()) return () => undefined;

  let cancelled = false;
  setCaptureStatus("preparing");

  void (async () => {
    try {
      if (mode === "ui") {
        await waitForSelector("[data-ui-preview-ready]", 25_000);
        await delay(400);
      } else if (mode === "poster") {
        await waitForSelector("[data-poster-ready]", 25_000);
        await delay(200);
      } else if (mode === "editor") {
        await waitForSelector("[data-jg-editor], canvas", 30_000);
        await waitPlayFrames(readCaptureQuery().settle ?? 3_500);
      } else {
        await waitPlayFrames(readCaptureQuery().settle ?? 2_500);
      }
      if (!cancelled) setCaptureStatus("ready");
    } catch (error) {
      if (!cancelled) {
        setCaptureStatus("error", error instanceof Error ? error.message : String(error));
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}
