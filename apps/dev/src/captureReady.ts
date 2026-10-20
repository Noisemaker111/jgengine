/**
 * Shoot handshake: page marks an honest frame with a tiny status on
 * documentElement + a ≤1KB console line. The host pulls pixels via CDP
 * Page.captureScreenshot — never ships PNG/base64 through the page.
 */

import { modelLoadIdleMs, modelLoadStarts } from "@jgengine/shell/render/modelLoad";

import { resolvedLook } from "./appEnv";
import { pickStartAction, waitForQuiescentView, type StartCandidate, type ViewActivity } from "./captureSettle";
import { verifyLookSubject } from "./lookCamera";
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

let hostStatus: CaptureStatus | undefined;
let guardInstalled = false;

/**
 * The runner owns `data-jg-capture`. Game code that writes it (a game-local readiness component)
 * would declare ready on its own terms, e.g. with a start menu still up; restore the runner's value
 * and say so in the capture note instead.
 */
function guardCaptureFlag(root: HTMLElement): void {
  if (guardInstalled || typeof MutationObserver === "undefined") return;
  guardInstalled = true;
  let reported = false;
  new MutationObserver(() => {
    if (hostStatus === undefined || root.dataset.jgCapture === hostStatus) return;
    if (!reported) {
      reported = true;
      addCaptureNote(`game code changed data-jg-capture to ${JSON.stringify(root.dataset.jgCapture ?? null)}; the dev runner owns readiness, so it was restored — remove the game's own capture readiness code`);
    }
    root.dataset.jgCapture = hostStatus;
  }).observe(root, { attributes: true, attributeFilter: ["data-jg-capture"] });
}

export function setCaptureStatus(status: CaptureStatus, error?: string): void {
  if (typeof document === "undefined") return;
  if (status !== "error" && document.documentElement.dataset.jgCapture === "error") return;
  hostStatus = status;
  guardCaptureFlag(document.documentElement);
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

/** Streaming counts as done after this much loader idle; below it a model can still pop in. */
const MODEL_IDLE_MS = 400;
const MODEL_IDLE_TIMEOUT_MS = 15_000;
/** Budget for staged work to tick, mount and finish streaming before the gate gives up. */
const QUIESCENCE_TIMEOUT_MS = 90_000;
/** Start-menu rounds the gate clicks through when the game declares no `capture.play`. */
const AUTO_START_ROUNDS = 3;

/**
 * Block until the shared GLB loader has been idle for {@link MODEL_IDLE_MS}, bounded.
 * A detached `?look=` camera frames a region the player never stood in, so its models
 * are still streaming when a fixed settle expires — the reason establishing captures
 * used to need a hand-tuned `--settle` before they stopped coming back half-empty.
 */
async function waitForModelStreaming(): Promise<void> {
  const deadline = Date.now() + MODEL_IDLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (modelLoadIdleMs() >= MODEL_IDLE_MS) return;
    await delay(100);
  }
}

function nextFrames(count: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let left = count;
    const tick = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function viewActivity(): ViewActivity {
  return {
    modelLoadStarts: modelLoadStarts(),
    viewLoading: document.querySelector("[data-shell-code-loading]") !== null,
  };
}

async function settleView(): Promise<void> {
  const failure = await waitForQuiescentView(
    { activity: viewActivity, frames: nextFrames, modelIdle: waitForModelStreaming, now: () => Date.now() },
    QUIESCENCE_TIMEOUT_MS,
  );
  if (failure === null) return;
  if (viewActivity().viewLoading) throw new Error(failure);
  addCaptureNote(failure);
}

/**
 * Capture-run bookkeeping shared between {@link createCaptureContextReady} (which applies the run
 * when the game context exists) and the readiness gate (which must not declare ready before it).
 */
const captureRunState = { expected: false, applied: false };

async function waitForCaptureRun(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (captureRunState.expected && !captureRunState.applied) {
    if (Date.now() >= deadline) throw new Error(`the capture run never applied within ${Math.round(timeoutMs / 1000)}s — the game context did not start`);
    await delay(100);
  }
}

/** Human-readable notes about what the gate did, surfaced by shoot/drive after readiness. */
function addCaptureNote(note: string): void {
  const root = document.documentElement;
  const current = root.dataset.jgCaptureNote;
  root.dataset.jgCaptureNote = (current === undefined || current === "" ? note : `${current}; ${note}`).slice(0, 500);
}

async function waitPlayFrames(settleMs: number): Promise<void> {
  await waitForSelector("canvas, [data-jg-frame-ready]", 25_000);
  await waitForCaptureRun(25_000);
  await settleView();
  await delay(settleMs);
  const after = viewActivity();
  if (after.viewLoading || modelLoadIdleMs() < MODEL_IDLE_MS) await settleView();
}

function menuOnScreen(): Element | null {
  const phase = document.documentElement.dataset.jgPhase;
  return document.querySelector("[data-jg-menu]") ?? (phase === "menu" ? document.body : null);
}

function startCandidates(menu: Element): (StartCandidate & { element: HTMLElement })[] {
  return Array.from(menu.querySelectorAll<HTMLElement>("button, [role=button], a[href]")).map((element) => {
    const label = `${element.className} ${element.dataset.variant ?? ""}`.toLowerCase();
    return {
      element,
      text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim(),
      disabled: element.matches(":disabled") || element.closest("[aria-disabled=\"true\"], [inert]") !== null,
      visible: element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? element.offsetParent !== null,
      marked: element.closest("[data-jg-start]") !== null,
      primary: /primary|\bcta\b/.test(label),
      utility: element.closest("[data-jg-menu-settings]") !== null,
    };
  });
}

/**
 * Leave a start menu the game did not script past. With an explicit `capture.play`/`?run=` the
 * menu is an error the game owns; otherwise click the menu's primary start action (see
 * {@link pickStartAction}) up to {@link AUTO_START_ROUNDS} times and record what was clicked.
 */
async function passStartMenu(explicitStart: boolean): Promise<void> {
  if (new URLSearchParams(window.location.search).get("state") !== null) return;
  if (menuOnScreen() === null) return;
  if (explicitStart) {
    throw new Error(
      "play-mode capture reached ready with a start menu still on screen — the game's capture.play (or --run) commands did not leave the menu",
    );
  }
  const clicked: string[] = [];
  for (let round = 0; round < AUTO_START_ROUNDS; round += 1) {
    const menu = menuOnScreen();
    if (menu === null) break;
    const pick = pickStartAction(startCandidates(menu));
    if (pick === null) break;
    clicked.push(pick.text.replace(/\s+/g, " ").slice(0, 40));
    pick.element.click();
    await settleView();
  }
  if (menuOnScreen() === null) {
    addCaptureNote(`auto-start clicked ${clicked.map((text) => `"${text}"`).join(" then ")} (no capture.play declared — declare it to pin the start path)`);
    return;
  }
  throw new Error(
    clicked.length === 0
      ? "play-mode capture found a start menu with no recognizable start button — mark it data-jg-start, or declare PlayableGame.capture.play (or pass --run)"
      : `play-mode capture clicked ${clicked.map((text) => `"${text}"`).join(" then ")} but a start menu is still on screen — declare PlayableGame.capture.play (or pass --run)`,
  );
}

/**
 * When `?capture=1`, marks preparing → ready|error once the runner has an
 * honest frame for the active mode. Host polls `data-jg-capture` / console.
 * `expectRun` holds readiness until the capture run has applied; `explicitStart`
 * says the game (or `?run=`) scripted its own way past a start menu.
 */
export function armCaptureReady(
  mode: string,
  defaultSettleMs?: number,
  options: { expectRun?: boolean; explicitStart?: boolean } = {},
): () => void {
  if (!captureArmed()) return () => undefined;

  let cancelled = false;
  captureRunState.expected = options.expectRun === true;
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
        await passStartMenu(options.explicitStart === true);
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
}): { captureRun: readonly CaptureRunEntry[]; error: string | null; source: "state" | "run" | "play" | null } {
  const { capture, stateParam, run, mode, gameId } = args;
  if (stateParam !== null) {
    const stateRun = capture?.states?.[stateParam];
    if (stateRun === undefined) {
      const known = Object.keys(capture?.states ?? {}).sort();
      const detail =
        known.length > 0 ? `declared states: ${known.join(", ")}` : "the game declares no capture.states";
      return { captureRun: [], error: `unknown capture state "${stateParam}" for ${gameId} — ${detail}`, source: "state" };
    }
    return { captureRun: stateRun, error: null, source: "state" };
  }
  if (run.length > 0) return { captureRun: run, error: null, source: "run" };
  if (captureArmed() && mode === "play") return { captureRun: capture?.play ?? [], error: null, source: "play" };
  return { captureRun: [], error: null, source: null };
}

/**
 * Build the `onContextReady` callback the shell fires once the game context is
 * live: run any staged scenario, then dispatch each
 * capture command. Returns `undefined` when there is nothing to do so the shell
 * skips the hook entirely. A command a staged `?state=`/`?run=` names that the game
 * rejects fails the capture (`strict`), since the frame would not show what the state
 * claims; a rejected `capture.play` command is only noted.
 */
export function createCaptureContextReady(opts: {
  captureRun: readonly CaptureRunEntry[];
  stageScenario?: (ctx: GameContext) => void;
  gameId: string;
  strict?: boolean;
}): ((ctx: GameContext) => void) | undefined {
  const { captureRun, stageScenario, gameId, strict = false } = opts;
  const aimsAtEntity = typeof window !== "undefined" && (resolvedLook() ?? "").startsWith("@entity:");
  if (stageScenario === undefined && captureRun.length === 0 && !aimsAtEntity) {
    return undefined;
  }
  const defaultCommandInput = { yaw: 0, pitch: 0, aim: { yaw: 0, pitch: 0 } };
  return (ctx: GameContext) => {
    const subjectError = verifyLookSubject(resolvedLook(), (id) => ctx.scene.entity.get(id) !== null);
    if (subjectError !== null && captureArmed()) setCaptureStatus("error", `look override rejected: ${subjectError}`);
    stageScenario?.(ctx);
    for (const entry of captureRun) {
      const name = typeof entry === "string" ? entry : entry.name;
      const input = typeof entry === "string" ? defaultCommandInput : (entry.input ?? defaultCommandInput);
      if (ctx.game.commands.has(name)) {
        const result = ctx.game.commands.run(name, input);
        if (result.status === "rejected" && captureArmed()) {
          const message = `capture command "${name}" was rejected by ${gameId}: ${result.reason}`;
          if (strict) setCaptureStatus("error", message);
          else addCaptureNote(message);
        }
      } else if (captureArmed()) {
        setCaptureStatus(
          "error",
          `capture command "${name}" is not registered by ${gameId} — registered commands: ${ctx.game.commands.names().sort().join(", ")}`,
        );
      }
    }
    captureRunState.applied = true;
  };
}
