/**
 * Input and capture steps shared by the engine's `bun run drive` and the portable `drive.mjs`.
 * Self-contained by contract (helpers arrive through `deps`), because the portable harness
 * embeds these functions with `Function.prototype.toString`.
 */

/** The CDP calls a drive step makes; both the engine and portable sessions satisfy it. */
export interface DriveSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  evaluate(expression: string, options?: { awaitPromise?: boolean }): Promise<unknown>;
}

/** Page-side helpers (serialized into the page) and a clock, injected so tests can drive time. */
export interface DriveInputDeps {
  focusGameSurface: (doc: never) => boolean;
  holdComplete: (input: { nowMs: number; deadlineMs: number; hardCapMs: number; framesElapsed: number }) => boolean;
  mouseButtonForCode: (code: string) => { button: "left" | "middle" | "right"; buttons: number } | null;
  gameSurfaceCenter: (doc: never) => { x: number; y: number } | null;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/** Release a held input once a check passes, instead of after a guessed duration. */
export interface DriveHoldUntil {
  /** True once the hold has arrived (a probe reading, a page value). */
  check: () => Promise<boolean>;
  /** How long the input may stay held before the hold fails. */
  timeoutMs: number;
  /** What the check asks, for the failure message. */
  describe: string;
}

/**
 * Hold a key, a `+`-joined chord (`KeyW+KeyD`) or a mouse button (`mouse0`/`mouse1`/`mouse2`, over
 * the play canvas) for `holdMs`, and on a frame-starved headless page until at least one frame
 * rendered under it (20s grace), so the sim actually steps. Focuses the play surface first and always releases.
 *
 * With `until`, `holdMs` is the minimum and the input stays down until the check passes, so a walk
 * "to the door" covers the same ground whether the page renders at 60 fps or 3. A hold that never
 * passes releases and throws at `until.timeoutMs`.
 */
export async function holdDriveInput(session: DriveSession, chord: string, holdMs: number, deps: DriveInputDeps, until?: DriveHoldUntil): Promise<void> {
  await session.send("Page.bringToFront");
  await session.evaluate("(" + deps.focusGameSurface.toString() + ")(document)");
  await session.evaluate("(() => { if (globalThis.__jgFrames !== undefined) return; globalThis.__jgFrames = 0; const tick = () => { globalThis.__jgFrames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()");
  const startFrames = Number(await session.evaluate("globalThis.__jgFrames ?? 0")) || 0;
  const startedMs = deps.now();
  const deadlineMs = startedMs + holdMs;
  const waitHold = async () => {
    for (;;) {
      await deps.sleep(until === undefined ? 100 : 50);
      const framesElapsed = (Number(await session.evaluate("globalThis.__jgFrames ?? 0")) || 0) - startFrames;
      if (until === undefined) {
        if (deps.holdComplete({ nowMs: deps.now(), deadlineMs, hardCapMs: deadlineMs + 20_000, framesElapsed })) break;
        continue;
      }
      if (deps.now() < deadlineMs || framesElapsed < 1) continue;
      if (await until.check()) break;
      if (deps.now() - startedMs >= until.timeoutMs) {
        throw new Error(until.describe + ": not true after " + until.timeoutMs + "ms of holding " + chord);
      }
    }
  };
  const mouse = deps.mouseButtonForCode(chord);
  if (mouse !== null) {
    const raw = await session.evaluate("JSON.stringify((" + deps.gameSurfaceCenter.toString() + ")(document))");
    const point = typeof raw === "string" ? (JSON.parse(raw) as { x: number; y: number } | null) : null;
    if (point === null) throw new Error("--key " + chord + " needs a play canvas to hold the button over");
    await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "none", buttons: 0 });
    await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: mouse.button, buttons: mouse.buttons, clickCount: 1 });
    try {
      await waitHold();
    } finally {
      await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: mouse.button, buttons: 0, clickCount: 1 });
    }
    return;
  }
  await sendDriveChord(session, chord, "keyDown");
  try {
    await waitHold();
  } finally {
    await sendDriveChord(session, chord, "keyUp");
  }
}

/** Modifier keys as a browser reports them: key name, virtual key code, left/right, and modifier bit. */
const MODIFIERS: Readonly<Record<string, { key: string; vk: number; location: number; bit: number }>> = {
  ShiftLeft: { key: "Shift", vk: 16, location: 1, bit: 8 },
  ShiftRight: { key: "Shift", vk: 16, location: 2, bit: 8 },
  ControlLeft: { key: "Control", vk: 17, location: 1, bit: 2 },
  ControlRight: { key: "Control", vk: 17, location: 2, bit: 2 },
  AltLeft: { key: "Alt", vk: 18, location: 1, bit: 1 },
  AltRight: { key: "Alt", vk: 18, location: 2, bit: 1 },
};

/**
 * The CDP key events for a `+`-joined chord, in order, as a real keyboard sends them: a modifier gets
 * its real key name and code, and every key pressed while it is down carries its modifier bit, so a
 * held Shift reads as Shift to the page.
 */
export function driveChordEvents(chord: string, type: "keyDown" | "keyUp"): Record<string, unknown>[] {
  const codes = chord.split("+");
  let modifiers = type === "keyDown" ? 0 : codes.reduce((bits, code) => bits | (MODIFIERS[code]?.bit ?? 0), 0);
  return codes.map((code) => {
    const modifier = MODIFIERS[code];
    if (modifier === undefined) return { type, code, key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code, modifiers };
    modifiers = type === "keyDown" ? modifiers | modifier.bit : modifiers & ~modifier.bit;
    return { type, code, key: modifier.key, windowsVirtualKeyCode: modifier.vk, location: modifier.location, modifiers };
  });
}

/** Press or release a chord on the page. */
export async function sendDriveChord(session: DriveSession, chord: string, type: "keyDown" | "keyUp"): Promise<void> {
  for (const event of driveChordEvents(chord, type)) await session.send("Input.dispatchKeyEvent", event);
}

/**
 * Before a screenshot, wait (bounded) for the shell's "Loading game view…" fallback to leave the
 * screen, and refuse to capture it: a frame of the loading panel is never evidence of the game.
 */
export async function awaitGameView(session: DriveSession, timeoutMs: number, deps: Pick<DriveInputDeps, "sleep" | "now">): Promise<void> {
  const deadline = deps.now() + timeoutMs;
  for (;;) {
    const loading = await session.evaluate("document.querySelector(\"[data-shell-code-loading]\") !== null");
    if (loading !== true) return;
    if (deps.now() >= deadline) {
      throw new Error("the game view is still loading (\"Loading game view…\" on screen) after " + Math.round(timeoutMs / 1000) + "s; refusing to capture the loading panel");
    }
    await deps.sleep(250);
  }
}
