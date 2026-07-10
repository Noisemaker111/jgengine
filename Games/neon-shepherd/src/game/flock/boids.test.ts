import { describe, expect, test } from "bun:test";
import { DEFAULT_FLOCK_TUNING, holdRingTarget, stepFlock, type CreaturePos } from "./boids";

function creature(id: string, x: number, z: number): CreaturePos {
  return { id, x, z, vx: 0, vz: 0, alive: true, straggler: false };
}

describe("flock separation and cohesion", () => {
  test("separation pushes two overlapping creatures apart", () => {
    const creatures = [creature("a", 0, 0), creature("b", 0.2, 0)];
    const before = Math.hypot(creatures[0]!.x - creatures[1]!.x, creatures[0]!.z - creatures[1]!.z);
    const next = stepFlock({
      creatures,
      shepherd: { x: 0, z: 100 },
      mode: "gather",
      holdAnchor: null,
      strayBase: new Map(),
      dt: 0.1,
      t: 0,
      tuning: DEFAULT_FLOCK_TUNING,
    });
    const after = Math.hypot(next[0]!.x - next[1]!.x, next[0]!.z - next[1]!.z);
    expect(after).toBeGreaterThan(before);
  });

  test("never produces NaN or infinite positions for a tight cluster", () => {
    const creatures: CreaturePos[] = [];
    for (let i = 0; i < 12; i += 1) creatures.push(creature(`c${i}`, Math.random() * 0.3, Math.random() * 0.3));
    let state = creatures;
    for (let step = 0; step < 30; step += 1) {
      state = stepFlock({
        creatures: state,
        shepherd: { x: 5, z: 5 },
        mode: "follow",
        holdAnchor: null,
        strayBase: new Map(),
        dt: 0.05,
        t: step * 0.05,
        tuning: DEFAULT_FLOCK_TUNING,
      });
    }
    for (const c of state) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.z)).toBe(true);
      expect(Number.isFinite(c.vx)).toBe(true);
      expect(Number.isFinite(c.vz)).toBe(true);
    }
  });

  test("separation keeps a minimum spacing under sustained cohesion pressure", () => {
    let state: CreaturePos[] = [creature("a", -0.1, 0), creature("b", 0.1, 0), creature("c", 0, 0.15)];
    for (let step = 0; step < 60; step += 1) {
      state = stepFlock({
        creatures: state,
        shepherd: { x: 0, z: 0 },
        mode: "follow",
        holdAnchor: null,
        strayBase: new Map(),
        dt: 0.05,
        t: step * 0.05,
        tuning: DEFAULT_FLOCK_TUNING,
      });
    }
    const distances = [
      Math.hypot(state[0]!.x - state[1]!.x, state[0]!.z - state[1]!.z),
      Math.hypot(state[0]!.x - state[2]!.x, state[0]!.z - state[2]!.z),
      Math.hypot(state[1]!.x - state[2]!.x, state[1]!.z - state[2]!.z),
    ];
    for (const d of distances) expect(d).toBeGreaterThan(0.05);
  });
});

describe("straggler trust-radius rule", () => {
  test("a creature beyond the trust radius flags as a straggler and does not close the gap", () => {
    const far = creature("far", 0, 40);
    const near = creature("near", 0, 3);
    const next = stepFlock({
      creatures: [far, near],
      shepherd: { x: 0, z: 0 },
      mode: "follow",
      holdAnchor: null,
      strayBase: new Map(),
      dt: 0.1,
      t: 0,
      tuning: DEFAULT_FLOCK_TUNING,
    });
    const farAfter = next[0]!;
    const nearAfter = next[1]!;
    expect(farAfter.straggler).toBe(true);
    expect(nearAfter.straggler).toBe(false);

    const distBefore = Math.hypot(far.x, far.z);
    const distAfter = Math.hypot(farAfter.x, farAfter.z);
    expect(distAfter).toBeGreaterThanOrEqual(distBefore - DEFAULT_FLOCK_TUNING.wanderRadius - 0.2);
  });

  test("a straggler resumes following once back within the trust radius", () => {
    const rejoined = creature("rejoined", 0, 4);
    rejoined.straggler = true;
    const next = stepFlock({
      creatures: [rejoined],
      shepherd: { x: 0, z: 0 },
      mode: "follow",
      holdAnchor: null,
      strayBase: new Map(),
      dt: 0.1,
      t: 0,
      tuning: DEFAULT_FLOCK_TUNING,
    });
    expect(next[0]!.straggler).toBe(false);
  });
});

describe("gather mode", () => {
  test("gathers creatures faster than the base follow speed and ignores trust radius", () => {
    const far = creature("far", 0, 40);
    const gathered = stepFlock({
      creatures: [far],
      shepherd: { x: 0, z: 0 },
      mode: "gather",
      holdAnchor: null,
      strayBase: new Map(),
      dt: 0.5,
      t: 0,
      tuning: DEFAULT_FLOCK_TUNING,
    })[0]!;
    const followed = stepFlock({
      creatures: [far],
      shepherd: { x: 0, z: 0 },
      mode: "follow",
      holdAnchor: null,
      strayBase: new Map(),
      dt: 0.5,
      t: 0,
      tuning: DEFAULT_FLOCK_TUNING,
    })[0]!;
    expect(gathered.straggler).toBe(false);
    const gatheredDist = Math.hypot(gathered.x, gathered.z);
    const followedDist = Math.hypot(followed.x, followed.z);
    expect(gatheredDist).toBeLessThan(followedDist);
  });
});

describe("hold-the-herd ring formation", () => {
  test("holdRingTarget spreads creatures evenly around the anchor", () => {
    const anchor = { x: 0, z: 0 };
    const a = holdRingTarget(anchor, 0, 4, 2);
    const b = holdRingTarget(anchor, 2, 4, 2);
    expect(Math.hypot(a.x - anchor.x, a.z - anchor.z)).toBeCloseTo(2, 5);
    expect(a.x - b.x).toBeCloseTo(4, 5);
  });

  test("creatures converge onto their ring positions while held", () => {
    let state: CreaturePos[] = [creature("a", 0, 0), creature("b", 0.5, 0.5), creature("c", -1, 1)];
    const anchor = { x: 10, z: 10 };
    for (let step = 0; step < 80; step += 1) {
      state = stepFlock({
        creatures: state,
        shepherd: { x: 0, z: 0 },
        mode: "hold",
        holdAnchor: anchor,
        strayBase: new Map(),
        dt: 0.05,
        t: step * 0.05,
        tuning: DEFAULT_FLOCK_TUNING,
      });
    }
    state.forEach((creature, index) => {
      const target = holdRingTarget(anchor, index, state.length, DEFAULT_FLOCK_TUNING.holdRingRadius);
      const distance = Math.hypot(creature.x - target.x, creature.z - target.z);
      expect(distance).toBeLessThan(0.3);
    });
  });
});
