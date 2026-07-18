/**
 * Shoot handshake: page marks an honest frame with a tiny status on
 * documentElement + a ≤1KB console line. The host pulls pixels via CDP
 * Page.captureScreenshot — never ships PNG/base64 through the page.
 */

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PlayableGame } from "@jgengine/shell/registry";

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

/**
 * Bot-playtest read hook, part of the capture handshake: exposes the game's
 * `capture.probe` as `window.__jgProbe`, a live read the `drive --playtest`
 * host samples over time to prove the loop advances under input. Returns `{}`
 * on any error so a probe throw never softlocks the whole harness.
 */
export function installPlaytestProbe(read: () => Record<string, number>): void {
  if (typeof window === "undefined") return;
  (window as { __jgProbe?: () => Record<string, number> }).__jgProbe = () => {
    try {
      const value = read();
      return value !== null && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  };
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
  if (status !== "error" && document.documentElement.dataset.jgCapture === "error") return;
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

function assertNoMenuOnScreen(): void {
  if (new URLSearchParams(window.location.search).get("state") !== null) return;
  const phase = document.documentElement.dataset.jgPhase;
  const menu = phase === "menu" ? document.documentElement : document.querySelector("[data-jg-menu]");
  if (menu !== null) {
    throw new Error(
      "play-mode capture reached ready with a start menu still on screen — declare the game's start commands in PlayableGame.capture.play (or pass --run) so shoot lands on live gameplay",
    );
  }
}

/**
 * When `?capture=1`, marks preparing → ready|error once the runner has an
 * honest frame for the active mode. Host polls `data-jg-capture` / console.
 */
export function armCaptureReady(mode: string, defaultSettleMs?: number): () => void {
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
        await waitPlayFrames(readCaptureQuery().settle ?? defaultSettleMs ?? 2_500);
        assertNoMenuOnScreen();
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

type CaptureConfig = PlayableGame["capture"];
export type CaptureRunEntry = string | { name: string; input?: unknown };

/**
 * Resolve which capture command run the runner should drive, mirroring the
 * precedence `?state=` → `?run=` → the game's declared `capture.play`. Pure:
 * an unknown `?state=` returns an `error` string for the caller to surface via
 * {@link setCaptureStatus} rather than touching the DOM itself.
 */
export function resolveCaptureRun(args: {
  capture: CaptureConfig;
  stateParam: string | null;
  run: readonly string[];
  mode: string;
  gameId: string;
}): { captureRun: readonly CaptureRunEntry[]; error: string | null } {
  const { capture, stateParam, run, mode, gameId } = args;
  if (stateParam !== null) {
    const stateRun = capture?.states?.[stateParam];
    if (stateRun === undefined) {
      const known = Object.keys(capture?.states ?? {}).sort();
      const detail =
        known.length > 0 ? `declared states: ${known.join(", ")}` : "the game declares no capture.states";
      return { captureRun: [], error: `unknown capture state "${stateParam}" for ${gameId} — ${detail}` };
    }
    return { captureRun: stateRun, error: null };
  }
  if (run.length > 0) return { captureRun: run, error: null };
  if (captureArmed() && mode === "play") return { captureRun: capture?.play ?? [], error: null };
  return { captureRun: [], error: null };
}

/**
 * Build the `onContextReady` callback the shell fires once the game context is
 * live: install the playtest probe, run any staged scenario, then dispatch each
 * capture command. Returns `undefined` when there is nothing to do so the shell
 * skips the hook entirely.
 */
export function createCaptureContextReady(opts: {
  captureRun: readonly CaptureRunEntry[];
  probe?: (ctx: GameContext) => Record<string, number>;
  stageScenario?: (ctx: GameContext) => void;
  gameId: string;
}): ((ctx: GameContext) => void) | undefined {
  const { captureRun, probe, stageScenario, gameId } = opts;
  if (stageScenario === undefined && captureRun.length === 0 && probe === undefined) return undefined;
  const defaultCommandInput = { yaw: 0, pitch: 0, aim: { yaw: 0, pitch: 0 } };
  return (ctx: GameContext) => {
    if (probe !== undefined) installPlaytestProbe(() => probe(ctx));
    stageScenario?.(ctx);
    for (const entry of captureRun) {
      const name = typeof entry === "string" ? entry : entry.name;
      const input = typeof entry === "string" ? defaultCommandInput : (entry.input ?? defaultCommandInput);
      if (ctx.game.commands.has(name)) {
        ctx.game.commands.run(name, input);
      } else if (captureArmed()) {
        setCaptureStatus(
          "error",
          `capture command "${name}" is not registered by ${gameId} — registered commands: ${ctx.game.commands.names().sort().join(", ")}`,
        );
      }
    }
  };
}
