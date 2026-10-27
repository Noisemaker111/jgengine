/**
 * The page side of a drive: click, fill, hold, probe and bridge calls over one CDP session, and the
 * {@link BrowserFlowDriver} a browser flow runs on. `drive --flow --browser` and `drive --step` both
 * drive a page through this file, so a step checked live behaves exactly as it will in the flow.
 */
import type { CdpSession } from "./browser-lib";
import { driveInputPointExpr } from "../packages/jgengine/src/templates/driveInput";
import { holdDriveInput, sendDriveChord, type DriveHoldUntil, type DriveInputDeps } from "../packages/jgengine/src/templates/driveSteps";
import type { BridgeAnswer, BrowserFlowDriver } from "./browserFlow";
import { acquireDrivePointerLock, aimDriveAt, lookDrivePointer, moveDrivePointer, type DrivePoint } from "./driveAim";
import { gameSurfaceCenter, mouseButtonForCode } from "../packages/jgengine/src/templates/gameSurfaceFocus";
import { dispatchClickAt } from "../packages/jgengine/src/clickInput";
import { focusGameSurface, holdComplete } from "./gameSurfaceFocus";
import { closestMatches } from "./closestMatch";

const SETTLE_EPSILON_PX = 0.5;
const SETTLE_SAMPLES = 3;
const SETTLE_INTERVAL_MS = 100;
// Match the portable drive: software GL can queue each DOM sample behind a
// multi-second rendered frame, even when the control is already actionable.
const SETTLE_TIMEOUT_MS = 45_000;
const SETTLE_MAX_SAMPLES = 10;

/**
 * The visible, enabled controls a click (or, with `input`, a fill) could target, each with whether
 * something else covers its centre, which is why a control that is plainly there still fails.
 */
function controlNamesExpr(input: boolean): string {
  return `((input) => {
    const selector = input ? 'input:not([type=hidden]), textarea' : 'button, [role=button], [role=switch], a';
    const controls = [];
    for (const node of document.querySelectorAll(selector)) {
      if (node.matches(':disabled') || node.closest('[aria-disabled="true"], [inert]')) continue;
      if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const covered = !(hit && (hit === node || node.contains(hit)));
      const labelled = (node.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      const accessible = labelled || node.getAttribute('aria-label') ||
        Array.from(node.labels || []).map(label => label.textContent || '').join(' ').trim();
      if (accessible) controls.push({ name: accessible, covered });
      if (!input && node.textContent && node.textContent.trim()) controls.push({ name: node.textContent.trim(), covered });
    }
    return controls;
  })(${input})`;
}

/** `; closest controls: "a", "b" (covered by another element)` for a click that found nothing to press. */
export function controlHint(text: string, controls: readonly { name: string; covered: boolean }[], what: string): string {
  const covered = new Set(controls.filter((control) => control.covered).map((control) => control.name.replace(/\s+/g, " ").trim()));
  const close = closestMatches(text, controls.map((control) => control.name));
  if (close.length === 0) return "";
  return `; closest ${what}: ${close.map((name) => JSON.stringify(name) + (covered.has(name) ? " (covered by another element)" : "")).join(", ")}`;
}

async function findClickPoint(session: CdpSession, text: string, input = false): Promise<{ x: number; y: number }> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let last: { x: number; y: number } | null = null;
  let stableRuns = 0;
  for (let samples = 0; samples < SETTLE_MAX_SAMPLES && Date.now() < deadline; samples += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const point = (await Promise.race([
      session.evaluate<{ x: number; y: number } | null>(driveInputPointExpr(text, input)),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), Math.max(1, deadline - Date.now())); }),
    ]).finally(() => { if (timer !== undefined) clearTimeout(timer); })) ?? null;
    if (Date.now() >= deadline) break;
    const moved = point !== null && last !== null &&
      (Math.abs(point.x - last.x) > SETTLE_EPSILON_PX || Math.abs(point.y - last.y) > SETTLE_EPSILON_PX);
    if (point !== null && last !== null && !moved) {
      stableRuns += 1;
      if (stableRuns >= SETTLE_SAMPLES - 1) return point;
    } else stableRuns = 0;
    last = point;
    await new Promise((r) => setTimeout(r, Math.min(deadline - Date.now(), point === null || moved ? 1_000 : SETTLE_INTERVAL_MS)));
  }
  const controls = (await session.evaluate<{ name: string; covered: boolean }[]>(controlNamesExpr(input)).catch(() => undefined)) ?? [];
  throw new Error(`drive: no settled actionable element matching "${text}"${controlHint(text, controls, input ? "fields" : "controls")}`);
}

/** Click the control whose text or accessible name contains `text`, once it stops moving. */
export async function clickText(session: CdpSession, text: string, count = 1, input = false): Promise<void> {
  await session.send("Page.bringToFront");
  const point = await findClickPoint(session, text, input);
  for (let clickCount = 1; clickCount <= count; clickCount += 1) {
    for (const type of ["mousePressed", "mouseReleased"] as const) {
      await session.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount });
    }
  }
}

/** Replace a labelled text field's value with native keyboard input, then Tab to commit it. */
export async function fillField(session: CdpSession, label: string, value: string): Promise<void> {
  await clickText(session, label, 1, true);
  if (!await session.evaluate<boolean>(driveInputPointExpr(label, true, true))) {
    throw new Error(`drive: text field "${label}" did not receive focus`);
  }
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, commands: ["selectAll"] });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  if (value) await session.send("Input.insertText", { text: value });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
}

/**
 * Focus the game's key-input surface so CDP keys reach the play-mode handler
 * (a React `onKeyDown` on the `tabIndex` wrapper) instead of `document.body`.
 * Serialises {@link focusGameSurface} into the page. Returns whether a surface
 * became the active element.
 */
export async function focusSurface(session: CdpSession): Promise<boolean> {
  await session.send("Page.bringToFront");
  const expression = `(${focusGameSurface.toString()})(document)`;
  return (await session.evaluate<boolean>(expression)) ?? false;
}

/** Install a standalone rAF counter so the hold loop can tell when the page
 * actually rendered a frame (one simulation step) under the held key. */
export async function installFrameCounter(session: CdpSession): Promise<void> {
  await session.evaluate(`(() => {
    if (globalThis.__jgFrames !== undefined) return;
    globalThis.__jgFrames = 0;
    const tick = () => { globalThis.__jgFrames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
}

export async function readFrames(session: CdpSession): Promise<number> {
  return (await session.evaluate<number>(`globalThis.__jgFrames ?? 0`)) ?? 0;
}

/** The waits and surface helpers the shared hold and view steps run on. */
export const driveDeps: DriveInputDeps = {
  focusGameSurface, holdComplete, mouseButtonForCode, gameSurfaceCenter,
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

/** Shared with the portable drive.mjs: key, chord or mouse hold that waits for a rendered frame. */
export function holdKey(session: CdpSession, chord: string, holdMs: number, until?: DriveHoldUntil): Promise<void> {
  return holdDriveInput(session, chord, holdMs, driveDeps, until);
}

/** Send one raw agent-bridge (or editor host) request and print its answer. */
export async function rpc(session: CdpSession, json: string): Promise<void> {
  JSON.parse(json);
  const value = await session.evaluate<string>(
    `(async () => {
      const host = globalThis.__jgengineAgent ?? globalThis.__jgengineEditorHost;
      if (host === undefined) return JSON.stringify({ ok: false, error: "no agent bridge or editor host on this page" });
      return JSON.stringify(await host.handle(${json}));
    })()`,
    { awaitPromise: true },
  );
  console.log(value ?? JSON.stringify({ ok: false, error: "rpc evaluation returned nothing" }));
}

/** Call the page's agent bridge and return its answer; a page with no bridge answers `ok: false`. */
export async function bridge(session: CdpSession, request: { method: string } & Record<string, unknown>): Promise<BridgeAnswer> {
  const raw = await session.evaluate<string>(
    `(async () => {
      const host = globalThis.__jgengineAgent;
      if (host === undefined) return JSON.stringify({ ok: false, error: "no agent bridge on this page" });
      return JSON.stringify(await host.handle(${JSON.stringify(request)}));
    })()`,
    { awaitPromise: true },
  );
  const answer: unknown = typeof raw === "string" ? JSON.parse(raw) : null;
  if (typeof answer !== "object" || answer === null || !("ok" in answer)) return { ok: false, error: "the agent bridge returned nothing" };
  if (answer.ok === true) return { ...answer, ok: true };
  return { ok: false, error: "error" in answer && typeof answer.error === "string" ? answer.error : "the agent bridge refused" };
}

/** The game's `capture.probe` numbers, or `null` when the page exposes none. */
export async function readProbe(session: CdpSession): Promise<Record<string, number> | null> {
  const value = await session.evaluate<Record<string, number> | null>(`(() => {
      const probe = globalThis.__jgProbe;
      if (typeof probe !== "function") return null;
      try {
        const value = probe();
        if (value === null || typeof value !== "object") return null;
        const out = {};
        for (const key of Object.keys(value)) {
          const n = value[key];
          if (typeof n === "number" && Number.isFinite(n)) out[key] = n;
        }
        return out;
      } catch {
        return null;
      }
    })()`);
  return value ?? null;
}

/**
 * Clear localStorage / IndexedDB / origin storage for the capture target BEFORE
 * navigating to it, so a game that auto-restores a save boots clean instead of
 * resuming a prior drive's session off a warm/persistent Chrome profile (issue
 * #1505). `Storage.clearDataForOrigin` takes an explicit origin, so it works
 * from the initial `about:blank` page without a round-trip navigation. Best
 * effort: a Chrome build that lacks the verb must not abort the drive.
 */
export async function clearOriginStorage(session: CdpSession, origin: string): Promise<void> {
  try {
    await session.send("Storage.clearDataForOrigin", {
      origin,
      storageTypes: "local_storage,indexeddb,websql,cache_storage,service_workers",
    });
  } catch (error) {
    console.error(
      `drive: could not clear ${origin} storage before capture (${error instanceof Error ? error.message : error}) — a restored save may corrupt the probe; pass --reuse-storage to silence`,
    );
  }
}

/** A lockstep recording's clock: game time moves only when the run advances it. */
export interface DriveClock {
  advance(ms: number): Promise<void>;
  readonly virtualNow: number;
}

/** What only the caller knows: how to reload its page and where a shot goes. */
export interface PageDriverOptions {
  /** The lockstep clock under `--record`, or null for wall time. */
  clock: DriveClock | null;
  reload(): Promise<void>;
  shot(name: string): Promise<void>;
}

/** The {@link BrowserFlowDriver} for one page: every flow call carried out over CDP. */
export function pageFlowDriver(session: CdpSession, options: PageDriverOptions): BrowserFlowDriver {
  const { clock } = options;
  // Let the UI react on the virtual clock so an input's effect is in frame.
  const settle = async (): Promise<void> => {
    if (clock !== null) await clock.advance(300);
  };
  let pointer: DrivePoint | null = null;
  return {
    async hold(chord, minMs, until) {
      if (clock === null) return holdKey(session, chord, minMs, until);
      // Lockstep hold: the virtual clock steps the sim under the key, so no frame-starvation grace is needed.
      await focusSurface(session);
      await sendDriveChord(session, chord, "keyDown");
      try {
        await clock.advance(minMs);
        if (until !== undefined) {
          for (let held = 0; !(await until.check()); held += 100) {
            if (held >= until.timeoutMs) throw new Error(until.describe + ": not true after " + until.timeoutMs + "ms of virtual time holding " + chord);
            await clock.advance(100);
          }
        }
      } finally {
        await sendDriveChord(session, chord, "keyUp");
      }
    },
    async click(text, count) {
      await clickText(session, text, count);
      await settle();
    },
    async clickAt(x, y, button) {
      await session.send("Page.bringToFront");
      await dispatchClickAt(session, { x, y }, button);
      await settle();
    },
    async moveMouse(x, y) {
      await moveDrivePointer(session, { x, y });
      pointer = { x, y };
      await settle();
    },
    async look(dx, dy) {
      await acquireDrivePointerLock(session);
      const turned = await lookDrivePointer(session, dx, dy);
      await settle();
      return turned.movement;
    },
    async aimAt(expression, tolerancePx) {
      // An unlocked page is aimed with the plain pointer, so a refused lock is not a failure here.
      await acquireDrivePointerLock(session).catch(() => false);
      const aimed = await aimDriveAt(session, pointer, expression, tolerancePx);
      pointer = aimed.from;
      await settle();
      return { point: aimed.point, moves: aimed.moves };
    },
    async fill(label, value) {
      await fillField(session, label, value);
      await settle();
    },
    evaluate: (expression) => session.evaluate(expression, { awaitPromise: true }),
    bridge: (request) => bridge(session, request),
    readProbe: () => readProbe(session),
    reload: () => options.reload(),
    shot: (name) => options.shot(name),
    sleep: (ms) => (clock === null ? new Promise<void>((r) => setTimeout(r, ms)) : clock.advance(ms)),
    now: () => (clock === null ? Date.now() : clock.virtualNow),
  };
}
