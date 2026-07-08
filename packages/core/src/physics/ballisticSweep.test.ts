import { describe, expect, test } from "bun:test";

import { createBallisticSweep } from "./ballisticSweep";
import { PhysicsWorld } from "./physicsWorld";

const BOUNDS = { min: [-20, 0, -20] as const, max: [20, 40, 20] as const };

function world(): PhysicsWorld {
  return new PhysicsWorld({ capacity: 64, bounds: BOUNDS, cellSize: 1 });
}

const ORIGIN: [number, number, number] = [0, 1, 0];
const VELOCITY: [number, number, number] = [0, 7, 7];
const GRAVITY = 9.8;
const MAX_TIME = 2;

describe("createBallisticSweep", () => {
  test("a static wall in the arc reports an impact at its face", () => {
    const w = world();
    w.addBody({ position: [0, 2, 5], halfExtents: [3, 3, 0.25], static: true });
    const sweep = createBallisticSweep(w);
    const hit = sweep(ORIGIN, VELOCITY, GRAVITY, MAX_TIME);
    expect(hit).not.toBeNull();
    if (hit === null) return;
    expect(hit.point[2]).toBeGreaterThan(4.6);
    expect(hit.point[2]).toBeLessThan(5.1);
    expect(hit.time).toBeCloseTo(hit.point[2] / 7, 5);
  });

  test("a clear arc returns null", () => {
    const w = world();
    w.addBody({ position: [15, 2, -15], halfExtents: [1, 1, 1], static: true });
    const sweep = createBallisticSweep(w);
    expect(sweep(ORIGIN, VELOCITY, GRAVITY, MAX_TIME)).toBeNull();
  });

  test("a sleeping body still blocks the projectile", () => {
    const w = world();
    const sleeper = w.addBody({ position: [0, 3.4, 5], halfExtents: [1, 1, 1], asleep: true });
    expect(w.isSleeping(sleeper)).toBe(true);
    const sweep = createBallisticSweep(w);
    const hit = sweep(ORIGIN, VELOCITY, GRAVITY, MAX_TIME);
    expect(hit).not.toBeNull();
    if (hit === null) return;
    expect(hit.point[2]).toBeGreaterThan(3.7);
    expect(hit.point[2]).toBeLessThan(6.2);
  });

  test("a removed body no longer blocks", () => {
    const w = world();
    const wall = w.addBody({ position: [0, 2, 5], halfExtents: [3, 3, 0.25], static: true });
    w.removeBody(wall);
    const sweep = createBallisticSweep(w);
    expect(sweep(ORIGIN, VELOCITY, GRAVITY, MAX_TIME)).toBeNull();
  });

  test("the radius option inflates body AABBs", () => {
    const w = world();
    w.addBody({ position: [1.5, 3.4, 5], halfExtents: [1, 1, 1], static: true });
    const thin = createBallisticSweep(w);
    expect(thin(ORIGIN, VELOCITY, GRAVITY, MAX_TIME)).toBeNull();
    const fat = createBallisticSweep(w, { radius: 0.75 });
    expect(fat(ORIGIN, VELOCITY, GRAVITY, MAX_TIME)).not.toBeNull();
  });

  test("an origin already inside a body settles immediately at time zero", () => {
    const w = world();
    w.addBody({ position: [0, 1, 0], halfExtents: [1, 1, 1], static: true });
    const sweep = createBallisticSweep(w);
    const hit = sweep(ORIGIN, VELOCITY, GRAVITY, MAX_TIME);
    expect(hit).toEqual({ point: [0, 1, 0], time: 0 });
  });
});
