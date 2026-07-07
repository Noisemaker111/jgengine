import { describe, expect, test } from "bun:test";

import { PhysicsWorld } from "./physicsWorld";
import { createBuoyantBody } from "./buoyancy";
import { waterSurface } from "../world/water";
import { NEUTRAL_AXIS } from "../input/axisInput";

const BOUNDS = { min: [-60, -30, -60] as const, max: [60, 30, 60] as const };

function world(): PhysicsWorld {
  return new PhysicsWorld({ capacity: 32, bounds: BOUNDS, gravity: -20, linearDamping: 0, cellSize: 8, sleepThresholdSteps: 1e9 });
}

describe("BuoyantBody", () => {
  test("a body dropped below a flat water surface rises and floats near the waterline", () => {
    const w = world();
    const water = waterSurface({ level: 0, waves: 0 });
    const body = w.addBody({ position: [0, -3, 0], halfExtents: [1, 0.5, 2] });
    const boat = createBuoyantBody(w, { body, water });
    for (let i = 0; i < 600; i += 1) {
      boat.update(1 / 60, 0);
      w.step(1 / 60);
    }
    const [, y] = boat.position;
    expect(y).toBeGreaterThan(-1.5);
    expect(y).toBeLessThan(1.5);
    expect(boat.submerged).toBe(true);
  });

  test("a body far above the water is not submerged and falls under gravity", () => {
    const w = world();
    const water = waterSurface({ level: 0, waves: 0 });
    const body = w.addBody({ position: [0, 20, 0], halfExtents: [1, 0.5, 2] });
    const boat = createBuoyantBody(w, { body, water });
    boat.update(1 / 60, 0);
    w.step(1 / 60);
    expect(boat.submerged).toBe(false);
    expect(w.velY[body]!).toBeLessThan(0);
  });

  test("throttle drives the floating boat forward along its heading", () => {
    const w = world();
    const water = waterSurface({ level: 0, waves: 0 });
    const body = w.addBody({ position: [0, -0.2, 0], halfExtents: [1, 0.5, 2] });
    const boat = createBuoyantBody(w, { body, water, heading: 0 });
    for (let i = 0; i < 120; i += 1) {
      boat.update(1 / 60, i / 60, { ...NEUTRAL_AXIS, throttle: 1 });
      w.step(1 / 60);
    }
    expect(boat.position[2]).toBeGreaterThan(1);
    expect(boat.speed).toBeGreaterThan(0.5);
  });
});
