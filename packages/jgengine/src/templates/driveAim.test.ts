import { describe, expect, test } from "bun:test";

import { acquireDrivePointerLock, aimDriveAt, lookDrivePointer, moveDrivePointer, type DriveAimSession } from "./driveAim";

const WIDTH = 1600;
const HEIGHT = 900;
const CENTRE = { x: WIDTH / 2, y: HEIGHT / 2 };

/**
 * A page whose target is the projection of a yaw offset: a pointer-locked view turns by
 * `movementX / pxPerRad` pixels of projection, so the harness has to learn that cost.
 */
function fakePage(options: { pxPerRad?: number; locked?: boolean; deliverMovement?: "cdp" | "none" } = {}) {
  const pxPerRad = options.pxPerRad ?? 900;
  const state = { yaw: 0.75, sent: [] as { x: number; y: number }[], synthetic: 0, events: [] as string[], last: { x: 0, y: 0 }, acc: { x: 0, y: 0 } };
  const session: DriveAimSession = {
    async send(method, params) {
      state.events.push(method);
      if (method === "Input.dispatchMouseEvent") {
        state.last = { x: Number(params?.x), y: Number(params?.y) };
        state.sent.push(state.last);
        if (options.locked === true && options.deliverMovement !== "none") state.yaw -= (state.last.x - CENTRE.x) / pxPerRad;
      }
      if (method === "Runtime.evaluate" && JSON.stringify(params).includes("requestPointerLock")) {
        return { result: { value: options.locked === true ? "locked" : "refused" } };
      }
      return {};
    },
    async evaluate(expression) {
      if (expression.includes("pointerLockElement")) return options.locked === true;
      if (expression.includes("getBoundingClientRect")) return { x: CENTRE.x, y: CENTRE.y };
      if (expression.includes("__jgAimMove")) {
        if (expression.includes("state.acc = { x: 0, y: 0 }")) {
          state.acc = { x: 0, y: 0 };
          return true;
        }
        const delivered = options.deliverMovement === "none" ? state.acc : { x: state.last.x - CENTRE.x + state.acc.x, y: state.last.y - CENTRE.y + state.acc.y };
        const seen = options.deliverMovement === "none" ? state.synthetic : 1 + state.synthetic;
        return { x: delivered.x, y: delivered.y, seen };
      }
      if (expression.includes("Object.defineProperty")) {
        state.synthetic += 1;
        const dx = Number(/movementX', \{ value: (-?[\d.]+)/.exec(expression)?.[1] ?? 0);
        state.acc.x += dx;
        state.yaw -= dx / pxPerRad;
        return true;
      }
      if (expression.includes("crosshair.target")) {
        return { x: CENTRE.x + state.yaw * pxPerRad, y: CENTRE.y };
      }
      return null;
    },
  };
  return { session, state };
}

describe("aim steps", () => {
  test("moveMouse dispatches an absolute pointer move and no button", async () => {
    const { session, state } = fakePage();
    await moveDrivePointer(session, { x: 240, y: 180 });
    expect(state.sent).toEqual([{ x: 240, y: 180 }]);
    expect(state.events).toEqual(["Input.dispatchMouseEvent"]);
  });

  test("look turns a locked view and reports the movement the page saw", async () => {
    const { session, state } = fakePage({ locked: true });
    const before = state.yaw;
    const turned = await lookDrivePointer(session, 300, 0);
    expect(turned.movement).toEqual({ x: 300, y: 0 });
    expect(state.yaw).toBeLessThan(before);
  });

  test("look chunks a long turn from the pinned centre instead of leaving the viewport", async () => {
    const { session, state } = fakePage({ locked: true });
    await lookDrivePointer(session, 500, 0);
    expect(state.sent.map((point) => point.x)).toEqual([CENTRE.x + 200, CENTRE.x + 200, CENTRE.x + 100]);
  });

  test("look falls back to a page move carrying the deltas when CDP delivers none", async () => {
    const { session, state } = fakePage({ locked: true, deliverMovement: "none" });
    const before = state.yaw;
    await lookDrivePointer(session, 120, 0);
    expect(state.synthetic).toBe(1);
    expect(state.yaw).toBeLessThan(before);
  });

  test("look refuses a page that takes the move and never reports movement", async () => {
    const { session } = fakePage({ locked: true, deliverMovement: "none" });
    const silent: DriveAimSession = {
      async send(method, params) {
        return session.send(method, params);
      },
      async evaluate(expression) {
        if (expression.includes("__jgAimMove")) {
          return expression.includes("state.acc = { x: 0, y: 0 }") ? true : { x: 0, y: 0, seen: 0 };
        }
        if (expression.includes("Object.defineProperty")) return false;
        if (expression.includes("getBoundingClientRect")) return { x: CENTRE.x, y: CENTRE.y };
        return null;
      },
    };
    await expect(lookDrivePointer(silent, 40, 0)).rejects.toThrow("reported no movement");
  });

  test("acquireDrivePointerLock asks the canvas for the lock, never a mouse button", async () => {
    const { session, state } = fakePage({ locked: true });
    expect(await acquireDrivePointerLock(session)).toBe(true);
    expect(state.events).toEqual([]);
    const late = fakePage({ locked: true });
    expect(await acquireDrivePointerLock(late.session)).toBe(true);
    expect(late.state.events.some((method) => method.includes("MouseEvent"))).toBe(false);
  });

  test("aimAt learns a fast page's pixel cost and lands inside the tolerance", async () => {
    const { session } = fakePage({ locked: true, pxPerRad: 2200 });
    const aimed = await aimDriveAt(session, null, "crosshair.target()", 6);
    expect(aimed.moves).toBeGreaterThan(0);
    expect(Math.abs(aimed.point.x - CENTRE.x)).toBeLessThanOrEqual(6);
  });

  test("aimAt lands on a slow page too, without being told the sensitivity", async () => {
    const { session } = fakePage({ locked: true, pxPerRad: 400 });
    const aimed = await aimDriveAt(session, null, "crosshair.target()", 6);
    expect(Math.abs(aimed.point.x - CENTRE.x)).toBeLessThanOrEqual(6);
  });

  test("aimAt moves the plain pointer when the page is not pointer-locked", async () => {
    const { session, state } = fakePage({ locked: false });
    const aimed = await aimDriveAt(session, null, "crosshair.target()", 6);
    expect(aimed.moves).toBe(1);
    expect(state.sent.at(-1)?.x).toBeCloseTo(CENTRE.x + 0.75 * 900, 0);
  });
});
