import { describe, expect, test } from "bun:test";

import {
  advanceFreeFlight,
  createFreeFlightController,
  createFreeFlightState,
  resolveFreeFlightIntent,
  resolveFlightStep,
} from "./freeFlight";
import { createEmptyMovementKeys } from "./movementModel";

const DT = 1 / 60;

function keysFrom(held: string[]): ReturnType<typeof createEmptyMovementKeys> {
  const k = createEmptyMovementKeys();
  for (const h of held) {
    if (h === "moveForward" || h === "w") k.w = true;
    if (h === "moveBack" || h === "s") k.s = true;
    if (h === "moveLeft" || h === "a") k.a = true;
    if (h === "moveRight" || h === "d") k.d = true;
    if (h === "jump" || h === "space") k.space = true;
    if (h === "crouch" || h === "control" || h === "c") { k.control = true; k.c = true; }
    if (h === "sprint" || h === "shift") k.shift = true;
  }
  return k;
}

describe("resolveFreeFlightIntent", () => {
  test("WASD maps to forward/right with correct strafe sign", () => {
    const a = resolveFreeFlightIntent(keysFrom(["a"]), null);
    expect(a.right).toBe(-1);
    expect(a.forward).toBe(0);
    expect(a.vertical).toBe(0);
    const d = resolveFreeFlightIntent(keysFrom(["d"]), null);
    expect(d.right).toBe(1);
    const w = resolveFreeFlightIntent(keysFrom(["w"]), null);
    expect(w.forward).toBe(1);
    const s = resolveFreeFlightIntent(keysFrom(["s"]), null);
    expect(s.forward).toBe(-1);
  });

  test("space ascends, control descends", () => {
    const up = resolveFreeFlightIntent(keysFrom(["space"]), null);
    expect(up.vertical).toBe(1);
    const down = resolveFreeFlightIntent(keysFrom(["control"]), null);
    expect(down.vertical).toBe(-1);
    const both = resolveFreeFlightIntent(keysFrom(["space", "control"]), null);
    expect(both.vertical).toBe(0);
  });
});

describe("advanceFreeFlight creative", () => {
  test("A moves +X when facing +Z (south), D moves -X — strafe stays yaw-relative, never roll", () => {
    const tuning = { mode: "creative" as const, speed: 8, acceleration: 40 };
    const yaw = 0;
    let state = createFreeFlightState();
    const aIntent = resolveFreeFlightIntent(keysFrom(["a"]), null);
    let step = advanceFreeFlight(state, aIntent, yaw, 0, DT, tuning);
    for (let i = 0; i < 20; i++) step = advanceFreeFlight(state, aIntent, yaw, 0, DT, tuning);
    expect(step.stepX).toBeGreaterThan(0);
    expect(Math.abs(step.stepZ)).toBeLessThan(0.01);

    state = createFreeFlightState();
    const dIntent = resolveFreeFlightIntent(keysFrom(["d"]), null);
    step = advanceFreeFlight(state, dIntent, yaw, 0, DT, tuning);
    for (let i = 0; i < 20; i++) step = advanceFreeFlight(state, dIntent, yaw, 0, DT, tuning);
    expect(step.stepX).toBeLessThan(0);
  });

  test("W moves +Z, S moves -Z when yaw 0", () => {
    const tuning = { mode: "creative" as const, speed: 8, acceleration: 40 };
    const yaw = 0;
    let state = createFreeFlightState();
    const wIntent = resolveFreeFlightIntent(keysFrom(["w"]), null);
    let step = advanceFreeFlight(state, wIntent, yaw, 0, DT, tuning);
    for (let i = 0; i < 20; i++) step = advanceFreeFlight(state, wIntent, yaw, 0, DT, tuning);
    expect(step.stepZ).toBeGreaterThan(0);
    expect(Math.abs(step.stepX)).toBeLessThan(0.01);

    state = createFreeFlightState();
    const sIntent = resolveFreeFlightIntent(keysFrom(["s"]), null);
    step = advanceFreeFlight(state, sIntent, yaw, 0, DT, tuning);
    for (let i = 0; i < 20; i++) step = advanceFreeFlight(state, sIntent, yaw, 0, DT, tuning);
    expect(step.stepZ).toBeLessThan(0);
  });

  test("W with yaw 90° (east) moves +X, A strafe is still yaw-relative", () => {
    const tuning = { mode: "creative" as const, speed: 8, acceleration: 40 };
    const yaw = Math.PI / 2;
    let state = createFreeFlightState();
    const wIntent = resolveFreeFlightIntent(keysFrom(["w"]), null);
    let step = advanceFreeFlight(state, wIntent, yaw, 0, DT, tuning);
    for (let i = 0; i < 20; i++) step = advanceFreeFlight(state, wIntent, yaw, 0, DT, tuning);
    expect(step.stepX).toBeGreaterThan(0);
    expect(Math.abs(step.stepZ)).toBeLessThan(0.02);

    state = createFreeFlightState();
    const aIntent = resolveFreeFlightIntent(keysFrom(["a"]), null);
    step = advanceFreeFlight(state, aIntent, yaw, 0, DT, tuning);
    for (let i = 0; i < 20; i++) step = advanceFreeFlight(state, aIntent, yaw, 0, DT, tuning);
    expect(step.stepZ).toBeLessThan(0);
  });

  test("space ascends, crouch descends, vertical independent of yaw", () => {
    const tuning = { mode: "creative" as const, speed: 8, acceleration: 40 };
    const yaw = 0.7;
    let state = createFreeFlightState();
    const up = resolveFreeFlightIntent(keysFrom(["space"]), null);
    let step = advanceFreeFlight(state, up, yaw, 0, DT, tuning);
    for (let i = 0; i < 20; i++) step = advanceFreeFlight(state, up, yaw, 0, DT, tuning);
    expect(step.stepY).toBeGreaterThan(0);
    expect(Math.abs(step.stepX)).toBeLessThan(0.01);

    state = createFreeFlightState();
    const down = resolveFreeFlightIntent(keysFrom(["control"]), null);
    step = advanceFreeFlight(state, down, yaw, 0, DT, tuning);
    for (let i = 0; i < 20; i++) step = advanceFreeFlight(state, down, yaw, 0, DT, tuning);
    expect(step.stepY).toBeLessThan(0);
  });

  test("sprint multiplies speed, diagonal stays normalized", () => {
    const tuning = { mode: "creative" as const, speed: 8, sprintMultiplier: 2, acceleration: 40 };
    const yaw = 0;
    let state = createFreeFlightState();
    const w = resolveFreeFlightIntent(keysFrom(["w"]), null);
    let step = advanceFreeFlight(state, w, yaw, 0, DT, tuning);
    for (let i = 0; i < 30; i++) step = advanceFreeFlight(state, w, yaw, 0, DT, tuning);
    const walkZ = step.stepZ;

    state = createFreeFlightState();
    const wSprint = resolveFreeFlightIntent(keysFrom(["w", "shift"]), null);
    step = advanceFreeFlight(state, wSprint, yaw, 0, DT, tuning);
    for (let i = 0; i < 30; i++) step = advanceFreeFlight(state, wSprint, yaw, 0, DT, tuning);
    expect(step.stepZ).toBeGreaterThan(walkZ * 1.8);

    state = createFreeFlightState();
    const diag = resolveFreeFlightIntent(keysFrom(["w", "d"]), null);
    step = advanceFreeFlight(state, diag, yaw, 0, DT, tuning);
    for (let i = 0; i < 30; i++) step = advanceFreeFlight(state, diag, yaw, 0, DT, tuning);
    const diagSpeed = Math.hypot(step.stepX, step.stepZ) / DT;
    expect(diagSpeed).toBeLessThan(8.1);
    expect(diagSpeed).toBeGreaterThan(7.5);
  });

  test("spectator alignWithLook: forward along pitch climbs", () => {
    const tuning = { mode: "spectator" as const, speed: 8, acceleration: 40, alignWithLook: true };
    const yaw = 0;
    const pitch = Math.PI / 4;
    let state = createFreeFlightState();
    const w = resolveFreeFlightIntent(keysFrom(["w"]), null);
    let step = advanceFreeFlight(state, w, yaw, pitch, DT, tuning);
    for (let i = 0; i < 30; i++) step = advanceFreeFlight(state, w, yaw, pitch, DT, tuning);
    expect(step.stepY).toBeGreaterThan(0.05);
    expect(step.stepZ).toBeGreaterThan(0.05);
  });

  test("hover with gravity falls when no input, rises when ascending", () => {
    const tuning = { mode: "hover" as const, speed: 6, gravity: 20, thrust: 40, acceleration: 20 };
    let state = createFreeFlightState();
    const idle = resolveFreeFlightIntent(keysFrom([]), null);
    let step = advanceFreeFlight(state, idle, 0, 0, DT, tuning);
    for (let i = 0; i < 60; i++) step = advanceFreeFlight(state, idle, 0, 0, DT, tuning);
    expect(step.stepY).toBeLessThan(0);

    state = createFreeFlightState();
    const up = resolveFreeFlightIntent(keysFrom(["space"]), null);
    step = advanceFreeFlight(state, up, 0, 0, DT, tuning);
    for (let i = 0; i < 60; i++) step = advanceFreeFlight(state, up, 0, 0, DT, tuning);
    expect(step.stepY).toBeGreaterThan(0);
  });
});

describe("createFreeFlightController", () => {
  test("snapshot/restore round-trip and retune changes speed", () => {
    const ctrl = createFreeFlightController({ mode: "creative", speed: 8 });
    const intent = resolveFreeFlightIntent(keysFrom(["w"]), null);
    ctrl.tick(DT, intent, 0);
    for (let i = 0; i < 10; i++) ctrl.tick(DT, intent, 0);
    const snap = ctrl.snapshot();
    expect(snap.vx).toBeDefined();
    ctrl.tick(DT, intent, 0);
    ctrl.restore(snap);
    expect(ctrl.snapshot()).toEqual(snap);
    ctrl.retune({ mode: "creative", speed: 16 });
    let s = ctrl.snapshot();
    expect(s).toEqual(snap);
    const stepFast = ctrl.tick(DT, intent, 0);
    for (let i = 0; i < 20; i++) ctrl.tick(DT, intent, 0);
    const fast = ctrl.velocity();
    expect(Math.hypot(fast[0], fast[2])).toBeGreaterThan(7);
    expect(stepFast.stepX).toBeDefined();
    ctrl.reset();
    expect(ctrl.snapshot().vx).toBe(0);
  });

  test("resolveFlightStep clamps vertical ceiling", () => {
    const pos: [number, number, number] = [0, 1, 0];
    const stepY = 2;
    const obstacles = [{ position: [0, 3, 0] as const, halfExtents: [1, 0.5, 1] as const }];
    const res = resolveFlightStep(pos, 0, stepY, 0, obstacles, 0.3);
    expect(res.stepY).toBeLessThan(stepY);
  });
});
