import { describe, expect, test } from "bun:test";

import { cellCoord, cellIndex, PhysicsWorld, type PhysicsWorldConfig } from "./physicsWorld";

const BOUNDS = { min: [-10, 0, -10] as const, max: [10, 20, 10] as const };

function world(overrides: Partial<PhysicsWorldConfig> = {}): PhysicsWorld {
  return new PhysicsWorld({ capacity: 4096, bounds: BOUNDS, cellSize: 1, ...overrides });
}

function frames(w: PhysicsWorld, n: number, dt = 1 / 60): void {
  for (let i = 0; i < n; i += 1) w.step(dt);
}

describe("grid indexing", () => {
  test("cellCoord clamps below, inside, and above the grid", () => {
    expect(cellCoord(-5, 0, 1, 10)).toBe(0);
    expect(cellCoord(3.7, 0, 1, 10)).toBe(3);
    expect(cellCoord(50, 0, 1, 10)).toBe(9);
  });

  test("cellIndex is a stable row-major linearization", () => {
    expect(cellIndex(0, 0, 0, 4, 4)).toBe(0);
    expect(cellIndex(1, 0, 0, 4, 4)).toBe(1);
    expect(cellIndex(0, 1, 0, 4, 4)).toBe(4);
    expect(cellIndex(0, 0, 1, 4, 4)).toBe(16);
  });

  test("grid dims derive from bounds and cell size", () => {
    const w = world({ cellSize: 2 });
    expect(w.cells).toEqual({ nx: 10, ny: 10, nz: 10, total: 1000 });
  });
});

describe("integration and bounds", () => {
  test("a dropped box falls and comes to rest on the floor", () => {
    const w = world();
    w.addBody({ position: [0, 10, 0], halfExtents: [0.5, 0.5, 0.5] });
    frames(w, 400);
    expect(w.posY[0]!).toBeCloseTo(0.5, 1);
    expect(Math.abs(w.velY[0]!)).toBeLessThan(0.05);
  });

  test("bodies never escape the container", () => {
    const w = world({ gravity: -30 });
    for (let i = 0; i < 200; i += 1) {
      w.addBody({
        position: [((i * 7) % 18) - 9, 2 + (i % 5) * 1.2, ((i * 13) % 18) - 9],
        halfExtents: [0.5, 0.5, 0.5],
        velocity: [((i % 3) - 1) * 4, 0, ((i % 5) - 2) * 3],
      });
    }
    frames(w, 300);
    for (let i = 0; i < w.count; i += 1) {
      expect(w.posX[i]!).toBeGreaterThanOrEqual(BOUNDS.min[0] - 1e-3);
      expect(w.posX[i]!).toBeLessThanOrEqual(BOUNDS.max[0] + 1e-3);
      expect(w.posY[i]!).toBeGreaterThanOrEqual(BOUNDS.min[1] - 1e-3);
      expect(w.posZ[i]!).toBeGreaterThanOrEqual(BOUNDS.min[2] - 1e-3);
      expect(w.posZ[i]!).toBeLessThanOrEqual(BOUNDS.max[2] + 1e-3);
    }
  });
});

describe("sleeping", () => {
  test("a settled body transitions to sleeping and stays put", () => {
    const w = world({ sleepThresholdSteps: 20 });
    w.addBody({ position: [0, 3, 0], halfExtents: [0.5, 0.5, 0.5] });
    frames(w, 500);
    expect(w.isSleeping(0)).toBe(true);
    expect(w.getStats().sleeping).toBe(1);
    const restY = w.posY[0]!;
    frames(w, 100);
    expect(w.posY[0]!).toBe(restY);
    expect(w.getStats().awake).toBe(0);
  });

  test("a body seeded asleep pays no integration cost", () => {
    const w = world();
    w.addBody({ position: [0, 8, 0], halfExtents: [0.5, 0.5, 0.5], asleep: true });
    frames(w, 60);
    expect(w.posY[0]!).toBe(8);
    expect(w.isSleeping(0)).toBe(true);
  });

  test("a sleeping body is woken by an awake body landing on it", () => {
    const w = world({ sleepThresholdSteps: 10 });
    const bed = w.addBody({ position: [0, 0.5, 0], halfExtents: [0.5, 0.5, 0.5], asleep: true });
    w.addBody({ position: [0.15, 6, 0], halfExtents: [0.5, 0.5, 0.5] });
    // Step until the contact from the faller clears the bed's sleep flag.
    let woke = false;
    for (let i = 0; i < 120 && !woke; i += 1) {
      w.step(1 / 60);
      if (!w.isSleeping(bed)) woke = true;
    }
    expect(woke).toBe(true);
    // After the impact settles, the two boxes are stacked, not interpenetrating.
    frames(w, 400);
    expect(Math.abs(w.posY[1]! - w.posY[bed]!)).toBeGreaterThan(0.9);
  });
});

describe("impulse response", () => {
  test("an equal-mass elastic head-on collision exchanges velocity", () => {
    const w = world({ gravity: 0, restitution: 1, friction: 0, sleepThresholdSteps: 100000 });
    w.addBody({ position: [-3, 5, 0], halfExtents: [0.5, 0.5, 0.5], velocity: [5, 0, 0] });
    w.addBody({ position: [3, 5, 0], halfExtents: [0.5, 0.5, 0.5], velocity: [-5, 0, 0] });
    frames(w, 120);
    // After the elastic bounce the left body moves left, the right body moves right.
    expect(w.velX[0]!).toBeLessThan(0);
    expect(w.velX[1]!).toBeGreaterThan(0);
  });

  test("overlapping bodies are pushed apart", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 100000 });
    w.addBody({ position: [0, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    w.addBody({ position: [0.3, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    frames(w, 200);
    const gap = Math.abs(w.posX[1]! - w.posX[0]!);
    expect(gap).toBeGreaterThan(0.9);
  });
});

describe("determinism", () => {
  test("two identical seeded worlds evolve bit-for-bit the same", () => {
    const build = () => {
      const w = world({ gravity: -25 });
      for (let i = 0; i < 300; i += 1) {
        w.addBody({
          position: [((i * 5) % 16) - 8, 1 + (i % 7), ((i * 11) % 16) - 8],
          halfExtents: [0.5, 0.5, 0.5],
          velocity: [((i % 4) - 2) * 2, 0, ((i % 3) - 1) * 2],
        });
      }
      return w;
    };
    const a = build();
    const b = build();
    frames(a, 250);
    frames(b, 250);
    for (let i = 0; i < a.count; i += 1) {
      expect(a.posX[i]!).toBe(b.posX[i]!);
      expect(a.posY[i]!).toBe(b.posY[i]!);
      expect(a.posZ[i]!).toBe(b.posZ[i]!);
    }
  });
});

describe("counters", () => {
  test("stats report counts and a non-negative step time", () => {
    const w = world();
    for (let i = 0; i < 50; i += 1) {
      w.addBody({ position: [(i % 10) - 5, 3 + i * 0.2, 0], halfExtents: [0.5, 0.5, 0.5] });
    }
    const stats = w.step(1 / 60);
    expect(stats.count).toBe(50);
    expect(stats.awake + stats.sleeping).toBe(50);
    expect(stats.substeps).toBeGreaterThanOrEqual(1);
    expect(stats.stepMs).toBeGreaterThanOrEqual(0);
  });
});
