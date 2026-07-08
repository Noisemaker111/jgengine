import { describe, expect, test } from "bun:test";

import {
  cellCoord,
  cellIndex,
  PhysicsWorld,
  type CollisionEvent,
  type PhysicsWorldConfig,
} from "./physicsWorld";

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

function distance(w: PhysicsWorld, a: number, b: number): number {
  const dx = w.posX[a]! - w.posX[b]!;
  const dy = w.posY[a]! - w.posY[b]!;
  const dz = w.posZ[a]! - w.posZ[b]!;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe("joints", () => {
  test("a distance joint pulls two bodies to its rest length", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 100000 });
    const a = w.addBody({ position: [-3, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    const b = w.addBody({ position: [3, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    w.distanceJoint({ bodyA: a, bodyB: b, restLength: 2 });
    frames(w, 300);
    expect(distance(w, a, b)).toBeCloseTo(2, 1);
    expect(w.jointCount).toBe(1);
  });

  test("a hinge pin holds a body at a world anchor under gravity", () => {
    const w = world({ sleepThresholdSteps: 100000 });
    const a = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    w.hingeJoint({ bodyA: a, anchorB: [0, 8, 0] });
    frames(w, 400);
    expect(w.posX[a]!).toBeCloseTo(0, 1);
    expect(w.posY[a]!).toBeCloseTo(8, 1);
  });

  test("a distance joint hangs a pendulum at rest length below its anchor", () => {
    const w = world({ sleepThresholdSteps: 100000 });
    const a = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    w.distanceJoint({ bodyA: a, anchorB: [0, 8, 0], restLength: 3 });
    frames(w, 500);
    expect(w.posY[a]!).toBeCloseTo(5, 0);
  });

  test("a spring joint converges toward its rest length", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 100000 });
    const a = w.addBody({ position: [0, 2, 0], halfExtents: [0.3, 0.3, 0.3] });
    w.springJoint({ bodyA: a, anchorB: [0, 8, 0], restLength: 3, stiffness: 40, damping: 12 });
    frames(w, 400);
    expect(w.posY[a]!).toBeCloseTo(5, 0);
  });

  test("removeJoint drops the constraint and frees the slot", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 100000 });
    const a = w.addBody({ position: [-3, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    const b = w.addBody({ position: [3, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    const j = w.distanceJoint({ bodyA: a, bodyB: b, restLength: 2 });
    w.removeJoint(j);
    expect(w.jointCount).toBe(0);
    w.velX[a] = -2;
    frames(w, 120);
    expect(distance(w, a, b)).toBeGreaterThan(3);
  });

  test("readJointSegments reports live world endpoints", () => {
    const w = world({ gravity: 0 });
    const a = w.addBody({ position: [-1, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    w.hingeJoint({ bodyA: a, anchorB: [2, 5, 0] });
    const out = new Float32Array(6);
    const n = w.readJointSegments(out);
    expect(n).toBe(1);
    expect(out[0]!).toBeCloseTo(-1, 5);
    expect(out[3]!).toBeCloseTo(2, 5);
  });
});

describe("removeBody", () => {
  test("other bodies keep their ids and positions after a removal", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 100000 });
    const a = w.addBody({ position: [-5, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    const b = w.addBody({ position: [0, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    const c = w.addBody({ position: [5, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    w.removeBody(b);
    expect(w.count).toBe(2);
    expect(w.posX[a]!).toBe(-5);
    expect(w.posX[c]!).toBe(5);
    frames(w, 5);
    expect(w.posX[a]!).toBe(-5);
    expect(w.posX[c]!).toBe(5);
  });

  test("a removed body's slot is skipped by the broadphase and never collides again", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 100000 });
    const a = w.addBody({ position: [0, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    const b = w.addBody({ position: [0.3, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    w.removeBody(b);
    frames(w, 60);
    expect(w.posX[a]!).toBe(0);
    expect(w.posY[a]!).toBe(5);
  });

  test("a slot freed by removeBody is reused by the next addBody", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 100000 });
    const a = w.addBody({ position: [0, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    w.removeBody(a);
    expect(w.count).toBe(0);
    const reused = w.addBody({ position: [1, 2, 3], halfExtents: [0.5, 0.5, 0.5] });
    expect(reused).toBe(a);
    expect(w.count).toBe(1);
    expect(w.posX[reused]!).toBe(1);
  });

  test("removing a body twice is a no-op", () => {
    const w = world();
    const a = w.addBody({ position: [0, 5, 0], halfExtents: [0.5, 0.5, 0.5] });
    w.removeBody(a);
    expect(() => w.removeBody(a)).not.toThrow();
    expect(w.count).toBe(0);
  });

  test("removing a supporting body wakes the sleeper resting on it", () => {
    const w = world({ sleepThresholdSteps: 10 });
    const support = w.addBody({ position: [0, 0.5, 0], halfExtents: [0.5, 0.5, 0.5], static: true });
    const rider = w.addBody({ position: [0, 1.5, 0], halfExtents: [0.5, 0.5, 0.5] });
    frames(w, 30);
    expect(w.isSleeping(rider)).toBe(true);
    w.removeBody(support);
    expect(w.isSleeping(rider)).toBe(false);
  });

  test("removing a body far from any sleeper leaves it asleep", () => {
    const w = world({ sleepThresholdSteps: 10 });
    const sleeper = w.addBody({ position: [8, 0.5, 8], halfExtents: [0.5, 0.5, 0.5], asleep: true });
    const distant = w.addBody({ position: [-8, 0.5, -8], halfExtents: [0.5, 0.5, 0.5], asleep: true });
    w.removeBody(distant);
    expect(w.isSleeping(sleeper)).toBe(true);
  });
});

describe("setVelocity / setPosition / teleport", () => {
  test("setVelocity overwrites velocity and wakes a sleeping body", () => {
    const w = world({ sleepThresholdSteps: 5 });
    const a = w.addBody({ position: [0, 5, 0], halfExtents: [0.5, 0.5, 0.5], asleep: true });
    expect(w.isSleeping(a)).toBe(true);
    w.setVelocity(a, 3, 0, -2);
    expect(w.velX[a]!).toBe(3);
    expect(w.velZ[a]!).toBe(-2);
    expect(w.isSleeping(a)).toBe(false);
  });

  test("setPosition moves a body, keeps velocity, and wakes it", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 5 });
    const a = w.addBody({ position: [0, 5, 0], halfExtents: [0.5, 0.5, 0.5], velocity: [1, 0, 0], asleep: true });
    w.setPosition(a, 2, 6, -3);
    expect(w.posX[a]!).toBe(2);
    expect(w.posY[a]!).toBe(6);
    expect(w.posZ[a]!).toBe(-3);
    expect(w.velX[a]!).toBe(1);
    expect(w.isSleeping(a)).toBe(false);
  });

  test("teleport moves a body and zeroes its velocity", () => {
    const w = world({ gravity: 0, sleepThresholdSteps: 5 });
    const a = w.addBody({ position: [0, 5, 0], halfExtents: [0.5, 0.5, 0.5], velocity: [4, 1, -4] });
    w.teleport(a, -3, 4, 3);
    expect(w.posX[a]!).toBe(-3);
    expect(w.posY[a]!).toBe(4);
    expect(w.posZ[a]!).toBe(3);
    expect(w.velX[a]!).toBe(0);
    expect(w.velY[a]!).toBe(0);
    expect(w.velZ[a]!).toBe(0);
  });
});

describe("broadphase capacity guard", () => {
  test("a tiny cellSize over huge bounds throws instead of hanging on allocation", () => {
    expect(
      () =>
        new PhysicsWorld({
          capacity: 16,
          bounds: { min: [-5000, -5000, -5000], max: [5000, 5000, 5000] },
          cellSize: 0.1,
        }),
    ).toThrow(/broadphase grid too large/);
  });

  test("bounds/cellSize that stay under the cap construct fine", () => {
    expect(() => new PhysicsWorld({ capacity: 16, bounds: BOUNDS, cellSize: 1 })).not.toThrow();
  });
});

describe("collision events", () => {
  test("onCollision delivers impacting pairs with an approach speed", () => {
    const w = world({ gravity: 0, restitution: 1, friction: 0, sleepThresholdSteps: 100000 });
    const events: CollisionEvent[] = [];
    w.onCollision((e) => {
      events.push({ ...e });
    }, 1);
    w.addBody({ position: [-3, 5, 0], halfExtents: [0.5, 0.5, 0.5], velocity: [6, 0, 0] });
    w.addBody({ position: [3, 5, 0], halfExtents: [0.5, 0.5, 0.5], velocity: [-6, 0, 0] });
    frames(w, 120);
    expect(events.length).toBeGreaterThan(0);
    const hit = events[0]!;
    expect(hit.a === 0 || hit.a === 1).toBe(true);
    expect(hit.approachSpeed).toBeGreaterThanOrEqual(1);
    expect(hit.impulse).toBeGreaterThan(0);
  });

  test("resting contacts below the threshold do not fire", () => {
    const w = world({ sleepThresholdSteps: 100000 });
    let fired = 0;
    w.onCollision(() => {
      fired += 1;
    }, 3);
    w.addBody({ position: [0, 0.5, 0], halfExtents: [0.5, 0.5, 0.5], static: true });
    w.addBody({ position: [0, 1.6, 0], halfExtents: [0.5, 0.5, 0.5] });
    frames(w, 400);
    const settled = fired;
    frames(w, 200);
    expect(fired).toBe(settled);
  });
});
