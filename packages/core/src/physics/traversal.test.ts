import { describe, expect, test } from "bun:test";

import { Glide, Grapple } from "./traversal";
import { PhysicsWorld } from "./physicsWorld";

const BOUNDS = { min: [-40, -20, -40] as const, max: [40, 100, 40] as const };

function world(gravity = -20): PhysicsWorld {
  return new PhysicsWorld({ capacity: 64, bounds: BOUNDS, gravity, cellSize: 8, sleepThresholdSteps: 100000 });
}

describe("Grapple", () => {
  test("fire misses beyond max length and attaches within it", () => {
    const w = world(0);
    const body = w.addBody({ position: [0, 0, 0], halfExtents: [0.3, 0.3, 0.3], mass: 1 });
    const g = new Grapple(w, body, { maxLength: 10 });
    expect(g.fire(0, 30, 0)).toBe(false);
    expect(g.attached).toBe(false);
    expect(g.fire(0, 8, 0)).toBe(true);
    expect(g.attached).toBe(true);
    expect(g.ropeLength).toBeCloseTo(8, 5);
    expect(w.jointCount).toBe(1);
  });

  test("reeling shortens the rope and pulls the traveller toward the anchor", () => {
    const w = world(0);
    const body = w.addBody({ position: [0, 0, 0], halfExtents: [0.3, 0.3, 0.3], mass: 1 });
    const g = new Grapple(w, body, { reelSpeed: 12, minLength: 1 });
    g.fire(0, 20, 0);
    const startY = w.posY[body]!;
    for (let i = 0; i < 240; i += 1) {
      g.reel(1 / 60);
      w.step(1 / 60);
    }
    expect(g.ropeLength).toBeCloseTo(1, 5);
    expect(w.posY[body]!).toBeGreaterThan(startY + 10);
    expect(g.distanceToAnchor()).toBeLessThan(2);
  });

  test("release removes the constraint", () => {
    const w = world(0);
    const body = w.addBody({ position: [0, 0, 0], halfExtents: [0.3, 0.3, 0.3], mass: 1 });
    const g = new Grapple(w, body);
    g.fire(5, 5, 0);
    expect(w.jointCount).toBe(1);
    g.release();
    expect(g.attached).toBe(false);
    expect(w.jointCount).toBe(0);
  });

  test("moveAnchor re-points a zipline attachment", () => {
    const w = world(0);
    const body = w.addBody({ position: [0, 0, 0], halfExtents: [0.3, 0.3, 0.3], mass: 1 });
    const g = new Grapple(w, body, { reelSpeed: 20, minLength: 0.5 });
    g.fire(0, 10, 0);
    g.moveAnchor(10, 10, 0);
    for (let i = 0; i < 300; i += 1) {
      g.reel(1 / 60);
      w.step(1 / 60);
    }
    expect(w.posX[body]!).toBeGreaterThan(6);
    expect(w.posY[body]!).toBeGreaterThan(6);
  });
});

describe("Glide", () => {
  test("reduces effective gravity so the body falls slower than free-fall", () => {
    const freeWorld = world();
    const free = freeWorld.addBody({ position: [0, 50, 0], halfExtents: [0.3, 0.3, 0.3], mass: 1 });
    const glideWorld = world();
    const glider = glideWorld.addBody({ position: [0, 50, 0], halfExtents: [0.3, 0.3, 0.3], mass: 1 });
    const glide = new Glide(glideWorld, glider, { gravityScale: 0.2, thrust: 0 });
    for (let i = 0; i < 120; i += 1) {
      freeWorld.step(1 / 60);
      glide.apply(1 / 60);
      glideWorld.step(1 / 60);
    }
    expect(glideWorld.posY[glider]!).toBeGreaterThan(freeWorld.posY[free]! + 5);
  });

  test("clamps descent to the terminal fall speed", () => {
    const w = world(-40);
    const body = w.addBody({ position: [0, 80, 0], halfExtents: [0.3, 0.3, 0.3], mass: 1 });
    const glide = new Glide(w, body, { gravityScale: 1, maxFallSpeed: 3 });
    for (let i = 0; i < 120; i += 1) {
      glide.apply(1 / 60);
      w.step(1 / 60);
    }
    expect(w.velY[body]!).toBeGreaterThan(-6);
    expect(w.velY[body]!).toBeLessThan(0);
  });

  test("thrust drives the body forward along the steer vector", () => {
    const w = world(-20);
    const body = w.addBody({ position: [0, 60, 0], halfExtents: [0.3, 0.3, 0.3], mass: 1 });
    const glide = new Glide(w, body, { gravityScale: 0.1, thrust: 12 });
    for (let i = 0; i < 120; i += 1) {
      glide.apply(1 / 60, 1, 0);
      w.step(1 / 60);
    }
    expect(w.posX[body]!).toBeGreaterThan(3);
  });
});
