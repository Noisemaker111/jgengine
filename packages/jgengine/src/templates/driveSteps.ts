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

/**
 * Hold a key, a `+`-joined chord (`KeyW+KeyD`) or a mouse button (`mouse0`/`mouse1`/`mouse2`, over
 * the play canvas) for `holdMs`, and on a frame-starved headless page until at least one frame
 * rendered under it (20s grace), so the sim actually steps. Focuses the play surface first and always releases.
 */
export async function holdDriveInput(session: DriveSession, chord: string, holdMs: number, deps: DriveInputDeps): Promise<void> {
  await session.send("Page.bringToFront");
  await session.evaluate("(" + deps.focusGameSurface.toString() + ")(document)");
  await session.evaluate("(() => { if (globalThis.__jgFrames !== undefined) return; globalThis.__jgFrames = 0; const tick = () => { globalThis.__jgFrames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()");
  const startFrames = Number(await session.evaluate("globalThis.__jgFrames ?? 0")) || 0;
  const deadlineMs = deps.now() + holdMs;
  const waitHold = async () => {
    for (;;) {
      await deps.sleep(100);
      const framesElapsed = (Number(await session.evaluate("globalThis.__jgFrames ?? 0")) || 0) - startFrames;
      if (deps.holdComplete({ nowMs: deps.now(), deadlineMs, hardCapMs: deadlineMs + 20_000, framesElapsed })) break;
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
  const codes = chord.split("+");
  const send = async (type: "keyDown" | "keyUp") => {
    for (const code of codes) {
      await session.send("Input.dispatchKeyEvent", { type, code, key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code });
    }
  };
  await send("keyDown");
  try {
    await waitHold();
  } finally {
    await send("keyUp");
  }
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
