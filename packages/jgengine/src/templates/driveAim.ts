/**
 * Pointer-move, look and aim steps shared by the engine's `bun run drive` and the portable
 * `drive.mjs`. Self-contained by contract: the portable harness embeds these functions with
 * `Function.prototype.toString`, so nothing here reads a module-scope identifier — page
 * expressions are inlined in the function that evaluates them.
 */

/** The CDP calls an aim step makes; both the engine and portable sessions satisfy it. */
export interface DriveAimSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  evaluate(expression: string, options?: { awaitPromise?: boolean }): Promise<unknown>;
}

/** A CSS viewport point. */
export interface DrivePoint {
  x: number;
  y: number;
}

/** Where the pointer last was, so a relative look has a position to move from. */
export type DrivePointerState = DrivePoint;

/**
 * Acquire pointer lock the way the game does — a lock request on the play canvas — but inside
 * CDP's user-gesture flag instead of a click, so a look step does not fire the weapon it aims.
 */
export async function acquireDrivePointerLock(session: DriveAimSession): Promise<boolean> {
  const locked = await session.evaluate(
    "document.pointerLockElement !== null && document.pointerLockElement === document.querySelector('canvas')",
  );
  if (locked === true) return true;
  const sent = (await session.send("Runtime.evaluate", {
    expression:
      "(async () => {" +
      "  const canvas = document.querySelector('canvas');" +
      "  if (canvas === null) return 'no-canvas';" +
      "  if (document.pointerLockElement === canvas) return 'locked';" +
      "  try { await canvas.requestPointerLock({ unadjustedMovement: true }); }" +
      "  catch { try { await canvas.requestPointerLock(); } catch { return 'refused'; } }" +
      "  for (let wait = 0; wait < 20 && document.pointerLockElement !== canvas; wait += 1) {" +
      "    await new Promise((done) => setTimeout(done, 10));" +
      "  }" +
      "  return document.pointerLockElement === canvas ? 'locked' : 'refused';" +
      "})()",
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })) as { result?: { value?: unknown } } | undefined;
  const value = sent?.result?.value;
  if (value === "locked") return true;
  if (value === "no-canvas") throw new Error("look: this page has no canvas to lock the pointer to; use moveMouse");
  throw new Error("look: the page refused pointer lock, so a relative look would never reach a pointer-locked camera");
}

/** Dispatch one absolute pointer move (a plain hover, no button) at CSS pixels. */
export async function moveDrivePointer(session: DriveAimSession, point: DrivePoint): Promise<void> {
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "none", buttons: 0 });
}

/**
 * Turn a pointer-locked view by `dx`,`dy` CSS pixels of mouse movement. Real CDP pointer moves are
 * tried first; when the browser delivers no movement through them (a locked page whose hardware
 * cursor never moves), a mousemove carrying the requested deltas is dispatched into the page, so
 * the game's own look handler still receives the turn. Each dispatch is measured from the locked
 * cursor, which Chrome pins at the surface centre, so a long turn is sent in centre-anchored
 * chunks. Returns the movement the page actually saw.
 */
export async function lookDrivePointer(
  session: DriveAimSession,
  dx: number,
  dy: number,
): Promise<{ movement: { x: number; y: number } }> {
  const centre = (await session.evaluate(
    "(() => {" +
      "  const canvas = document.querySelector('canvas');" +
      "  const rect = canvas === null ? null : canvas.getBoundingClientRect();" +
      "  if (rect !== null && rect.width > 0 && rect.height > 0) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };" +
      "  return { x: innerWidth / 2, y: innerHeight / 2 };" +
      "})()",
  )) as DrivePoint;
  await session.evaluate(
    "(() => {" +
      "  const state = globalThis.__jgAimMove ?? (globalThis.__jgAimMove = { acc: { x: 0, y: 0 }, seen: 0 });" +
      "  state.acc = { x: 0, y: 0 }; state.seen = 0;" +
      "  if (state.installed === true) return true;" +
      "  state.installed = true;" +
      "  window.addEventListener('mousemove', (event) => {" +
      "    state.seen += 1;" +
      "    state.acc.x += event.movementX || 0;" +
      "    state.acc.y += event.movementY || 0;" +
      "  }, true);" +
      "  return true;" +
      "})()",
  );
  const read = "(() => { const state = globalThis.__jgAimMove; return state ? { x: state.acc.x, y: state.acc.y, seen: state.seen } : { x: 0, y: 0, seen: 0 }; })()";
  const total = { x: 0, y: 0 };
  let remaining = { x: dx, y: dy };
  const clamp = (value: number) => Math.max(-200, Math.min(200, value));
  for (let chunk = 0; chunk < 40 && (Math.abs(remaining.x) > 0.5 || Math.abs(remaining.y) > 0.5); chunk += 1) {
    const send = { x: clamp(Math.trunc(remaining.x)), y: clamp(Math.trunc(remaining.y)) };
    if (send.x === 0 && send.y === 0) {
      remaining = { x: remaining.x - send.x, y: remaining.y - send.y };
      continue;
    }
    remaining = { x: remaining.x - send.x, y: remaining.y - send.y };
    await session.evaluate(
      "(() => {" +
        "  const state = globalThis.__jgAimMove ?? (globalThis.__jgAimMove = { acc: { x: 0, y: 0 }, seen: 0 });" +
        "  state.acc = { x: 0, y: 0 }; state.seen = 0;" +
        "  if (state.installed === true) return true;" +
        "  state.installed = true;" +
        "  window.addEventListener('mousemove', (event) => {" +
        "    state.seen += 1;" +
        "    state.acc.x += event.movementX || 0;" +
        "    state.acc.y += event.movementY || 0;" +
        "  }, true);" +
        "  return true;" +
        "})()",
    );
    await moveDrivePointer(session, { x: Math.round(centre.x + send.x), y: Math.round(centre.y + send.y) });
    let seen = (await session.evaluate(read)) as { x: number; y: number; seen: number } | undefined;
    if ((seen?.seen ?? 0) === 0) {
      await session.evaluate(
        "(() => {" +
          "  const event = new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window });" +
          "  Object.defineProperty(event, 'movementX', { value: " + send.x + " });" +
          "  Object.defineProperty(event, 'movementY', { value: " + send.y + " });" +
          "  window.dispatchEvent(event);" +
          "  return true;" +
          "})()",
      );
      seen = (await session.evaluate(read)) as { x: number; y: number; seen: number } | undefined;
      if ((seen?.seen ?? 0) === 0) {
        throw new Error("look: the page took the pointer move but reported no movement (" + dx + "," + dy + " px requested)");
      }
    }
    total.x += seen?.x ?? 0;
    total.y += seen?.y ?? 0;
    if ((seen?.x ?? 0) === 0 && (seen?.y ?? 0) === 0) break;
  }
  if (Math.max(Math.abs(total.x), Math.abs(total.y)) < 0.5) {
    throw new Error("look: the page took the pointer move but reported no movement (" + dx + "," + dy + " px requested)");
  }
  return { movement: total };
}

/**
 * Point the crosshair at a target the page can locate: `expression` evaluates to the target's CSS
 * screen point ({x,y}), or null while it is not visible. Each correction is measured against the
 * page's own projected point, so the step learns the game's look response instead of assuming it.
 */
export async function aimDriveAt(
  session: DriveAimSession,
  from: DrivePointerState | null,
  expression: string,
  tolerancePx: number,
): Promise<{ from: DrivePointerState; point: DrivePoint; moves: number }> {
  const centre = (await session.evaluate(
    "(() => {" +
      "  const canvas = document.querySelector('canvas');" +
      "  const rect = canvas === null ? null : canvas.getBoundingClientRect();" +
      "  if (rect !== null && rect.width > 0 && rect.height > 0) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };" +
      "  return { x: innerWidth / 2, y: innerHeight / 2 };" +
      "})()",
  )) as DrivePoint;
  const locked = (await session.evaluate(
    "document.pointerLockElement !== null && document.pointerLockElement === document.querySelector('canvas')",
  )) === true;
  const read = async (): Promise<DrivePoint | null> => {
    const value = (await session.evaluate("(async () => (" + expression + "))()", { awaitPromise: true })) as unknown;
    if (value === null || value === undefined) return null;
    const point = Array.isArray(value) ? { x: Number(value[0]), y: Number(value[1]) } : (value as DrivePoint);
    if (typeof point !== "object") return null;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x: point.x, y: point.y };
  };
  let pointer = from;
  let point = await read();
  if (point === null) throw new Error("aimAt: the page returned no screen point for " + JSON.stringify(expression));
  if (!locked) {
    await moveDrivePointer(session, point);
    const after = await read();
    if (after === null || Math.max(Math.abs(after.x - point.x), Math.abs(after.y - point.y)) > tolerancePx) {
      throw new Error("aimAt: the target moved away from the pointer (" + JSON.stringify(expression) + ")");
    }
    return { from: point, point: after, moves: 1 };
  }
  const offBy = (target: DrivePoint, pivotPoint: DrivePoint) => ({ x: target.x - pivotPoint.x, y: target.y - pivotPoint.y });
  let gain = 1;
  for (let moves = 0; moves < 8; moves += 1) {
    const error = offBy(point, centre);
    if (Math.max(Math.abs(error.x), Math.abs(error.y)) <= tolerancePx) return { from: pointer ?? centre, point, moves };
    const asked = { x: error.x * gain, y: error.y * gain };
    await lookDrivePointer(session, asked.x, asked.y);
    const next = await read();
    if (next === null) throw new Error("aimAt: the target left the page while aiming (" + JSON.stringify(expression) + ")");
    const useX = Math.abs(asked.x) >= Math.abs(asked.y);
    const input = useX ? asked.x : asked.y;
    const removed = useX ? point.x - next.x : point.y - next.y;
    const scale = Math.abs(input) < 1 ? Number.NaN : removed / input;
    if (Number.isFinite(scale) && Math.abs(scale) > 0.05 && Math.abs(scale) < 20) gain = 0.8 / scale;
    point = next;
  }
  const error = offBy(point, centre);
  throw new Error(
    "aimAt: the crosshair never reached " + JSON.stringify(expression) + " (last point " + JSON.stringify(point) +
      ", crosshair " + JSON.stringify(centre) + ", off by " + Math.round(error.x) + "," + Math.round(error.y) + "px, tolerance " + tolerancePx + "px)",
  );
}
