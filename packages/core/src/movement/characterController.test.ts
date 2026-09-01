import { describe, expect, test } from "bun:test";

import { createPhysicsWorldBackend } from "../physics/physicsWorldBackend";
import { createCharacterController } from "./characterController";

function world() {
  const backend = createPhysicsWorldBackend({ capacity: 64, bounds: { min: [-60, -5, -60], max: [60, 60, 60] }, warn: false });
  backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
  return backend;
}

function controller() {
  const c = createCharacterController({ radius: 0.35, height: 1.8, stepHeight: 0.4 });
  c.restore({ position: [0, 0, 0], verticalVelocity: 0, grounded: false, groundNormal: [0, 1, 0], groundBody: null, crouching: false });
  return c;
}

describe("createCharacterController", () => {
  test("lands on the floor and walks along it", () => {
    const backend = world();
    const c = controller();
    c.restore({ ...c.snapshot(), position: [0, 1, 0] });
    for (let i = 0; i < 60; i += 1) c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20 });
    expect(c.state().grounded).toBe(true);
    expect(c.state().position[1]).toBeCloseTo(0, 1);
    const result = c.move(backend, { motion: [0.1, 0, 0], dt: 1 / 60, gravity: 20 });
    expect(result.moved[0]).toBeCloseTo(0.1, 5);
    expect(result.grounded).toBe(true);
  });

  test("slides along a wall instead of stopping dead", () => {
    const backend = world();
    backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 2, 5] }, position: [2, 2, 0], kind: "static" });
    const c = controller();
    for (let i = 0; i < 40; i += 1) c.move(backend, { motion: [0.2, 0, 0.1], dt: 1 / 60, gravity: 20 });
    const s = c.state();
    expect(s.position[0]).toBeLessThan(2 - 0.5 - 0.35 + 0.001);
    expect(s.position[0]).toBeGreaterThan(1.0);
    expect(s.position[2]).toBeGreaterThan(2);
  });

  test("steps up a low ledge and is blocked by a high one", () => {
    const backend = world();
    backend.addBody({ shape: { kind: "box", halfExtents: [1, 0.15, 3] }, position: [2, 0.15, 0], kind: "static" });
    backend.addBody({ shape: { kind: "box", halfExtents: [1, 0.6, 3] }, position: [5, 0.6, 0], kind: "static" });
    const c = controller();
    let stepped = false;
    let maxY = 0;
    for (let i = 0; i < 120; i += 1) {
      const r = c.move(backend, { motion: [0.05, 0, 0], dt: 1 / 60, gravity: 20 });
      stepped = stepped || r.steppedUp;
      maxY = Math.max(maxY, c.state().position[1]);
    }
    expect(stepped).toBe(true);
    expect(maxY).toBeCloseTo(0.3, 1);
    const s = c.state();
    expect(s.position[1]).toBeCloseTo(0, 1);
    expect(s.position[0]).toBeLessThan(5 - 1 - 0.35 + 0.01);
    expect(s.position[0]).toBeGreaterThan(3.5);
  });

  test("jumps, hits a ceiling, and falls back", () => {
    const backend = world();
    backend.addBody({ shape: { kind: "box", halfExtents: [3, 0.1, 3] }, position: [0, 2.6, 0], kind: "static" });
    const c = controller();
    c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20 });
    expect(c.state().grounded).toBe(true);
    let ceiling = false;
    let maxY = 0;
    for (let i = 0; i < 90; i += 1) {
      const r = c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20, ...(i === 0 ? { jumpVelocity: 8 } : {}) });
      ceiling = ceiling || r.hitCeiling;
      maxY = Math.max(maxY, c.state().position[1]);
    }
    expect(ceiling).toBe(true);
    expect(maxY).toBeLessThan(2.5 - 1.8 + 0.05);
    expect(c.state().grounded).toBe(true);
  });

  test("crouches under an overhang and refuses to stand until clear", () => {
    const backend = world();
    backend.addBody({ shape: { kind: "box", halfExtents: [1, 0.1, 3] }, position: [2, 1.4, 0], kind: "static" });
    const c = controller();
    c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20, crouch: true });
    expect(c.state().crouching).toBe(true);
    for (let i = 0; i < 60; i += 1) c.move(backend, { motion: [0.05, 0, 0], dt: 1 / 60, gravity: 20 });
    expect(c.state().position[0]).toBeGreaterThan(1.5);
    const blocked = c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20, crouch: false });
    expect(blocked.crouchBlocked).toBe(true);
    expect(c.state().crouching).toBe(true);
    for (let i = 0; i < 60; i += 1) c.move(backend, { motion: [0.05, 0, 0], dt: 1 / 60, gravity: 20 });
    const clear = c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20, crouch: false });
    expect(clear.crouchBlocked).toBe(false);
    expect(c.state().crouching).toBe(false);
  });

  test("rides a moving platform", () => {
    const backend = world();
    const platform = backend.addBody({ shape: { kind: "box", halfExtents: [1.5, 0.2, 1.5] }, position: [0, 1, 0], kind: "kinematic" });
    const c = controller();
    c.restore({ ...c.snapshot(), position: [0, 1.5, 0] });
    for (let i = 0; i < 30; i += 1) {
      c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20 });
      backend.step(1 / 60);
    }
    expect(c.state().groundBody).toBe(platform);
    let x = 0;
    for (let i = 0; i < 30; i += 1) {
      x += 0.02;
      backend.setKinematicTarget(platform, [x, 1, 0]);
      backend.step(1 / 60);
      c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20 });
    }
    expect(c.state().position[0]).toBeGreaterThan(0.4);
  });

  test("retune and snapshot round-trip", () => {
    const c = controller();
    c.retune({ stepHeight: 0.6, crouchHeight: 1 });
    expect(c.config().stepHeight).toBe(0.6);
    expect(c.config().crouchHeight).toBe(1);
    const saved = c.snapshot();
    c.restore({ ...saved, position: [9, 9, 9] });
    c.restore(saved);
    expect(c.state().position).toEqual([0, 0, 0]);
  });
});
