import { describe, expect, test } from "bun:test";

import { createParticleSystem, validateEmitterConfig } from "./particles";

describe("createParticleSystem", () => {
  test("burst emit fills the pool up to max and no further", () => {
    const sys = createParticleSystem({ max: 4, lifetime: { min: 10, max: 10 } });
    sys.emit(3);
    expect(sys.count()).toBe(3);
    sys.emit(5); // only 1 slot left
    expect(sys.count()).toBe(4);
  });

  test("particles die exactly at their lifetime", () => {
    const sys = createParticleSystem({ max: 8, lifetime: { min: 2, max: 2 }, alpha: { start: 1, end: 1 } });
    sys.emit(4);
    sys.update(1.9);
    expect(sys.count()).toBe(4);
    sys.update(0.2); // total 2.1 >= 2
    expect(sys.count()).toBe(0);
  });

  test("continuous rate emits proportional to elapsed time", () => {
    const sys = createParticleSystem({ max: 100, rate: 10, lifetime: { min: 100, max: 100 } });
    sys.update(1); // 10/s * 1s = 10
    expect(sys.count()).toBe(10);
    sys.update(0.55); // 5.5 more → 5 (accumulator keeps the .5)
    expect(sys.count()).toBe(15);
  });

  test("gravity integrates velocity into position over time", () => {
    const sys = createParticleSystem({
      max: 1,
      lifetime: { min: 10, max: 10 },
      speed: { min: 0, max: 0 },
      gravity: [0, -10, 0],
      alpha: { start: 1, end: 1 },
    });
    sys.emit(1);
    sys.update(1);
    const { positions } = sys.buffers();
    // v becomes -10 after 1s, position moves by v*dt = -10.
    expect(positions[1]).toBeCloseTo(-10, 3);
  });

  test("size/color/alpha interpolate from start to end across life", () => {
    const sys = createParticleSystem({
      max: 1,
      lifetime: { min: 4, max: 4 },
      speed: { min: 0, max: 0 },
      size: { start: 2, end: 6 },
      colorStart: 0xff0000,
      colorEnd: 0x0000ff,
      alpha: { start: 1, end: 0 },
    });
    sys.emit(1);
    sys.update(2); // halfway through life
    const b = sys.buffers();
    expect(b.sizes[0]).toBeCloseTo(4, 3); // midpoint of 2..6
    expect(b.colors[0]).toBeCloseTo(0.5, 3); // red fading
    expect(b.colors[2]).toBeCloseTo(0.5, 3); // blue rising
    expect(b.alphas[0]).toBeCloseTo(0.5, 3);
  });

  test("same seed + same dt sequence reproduces identical positions", () => {
    function run() {
      const sys = createParticleSystem({ max: 32, rate: 20, spread: Math.PI, seed: "boom", lifetime: { min: 3, max: 3 } });
      sys.update(0.5);
      sys.update(0.5);
      return Array.from(sys.buffers().positions.slice(0, sys.count() * 3));
    }
    expect(run()).toEqual(run());
  });

  test("snapshot/restore round-trips the live pool", () => {
    const makeSys = () => createParticleSystem({ max: 16, rate: 30, spread: 1, seed: "snap", gravity: [0, -3, 0] });
    const sys = makeSys();
    sys.update(0.4);
    const snap = JSON.parse(JSON.stringify(sys.snapshot()));

    // Restore into a fresh system built from the same emitter config (authored data).
    const revived = makeSys();
    revived.restore(snap);
    expect(revived.count()).toBe(sys.count());
    expect(Array.from(revived.buffers().positions.slice(0, sys.count() * 3))).toEqual(
      Array.from(sys.buffers().positions.slice(0, sys.count() * 3)),
    );

    // ...and continues deterministically from the restored seed cursor.
    sys.update(0.2);
    revived.update(0.2);
    expect(revived.count()).toBe(sys.count());
  });

  test("clear empties the pool; subscribe fires on activity", () => {
    const sys = createParticleSystem({ max: 8, lifetime: { min: 5, max: 5 } });
    let hits = 0;
    const off = sys.subscribe(() => { hits += 1; });
    sys.emit(3);
    expect(sys.count()).toBe(3);
    sys.clear();
    expect(sys.count()).toBe(0);
    off();
    sys.emit(1);
    expect(hits).toBe(2); // emit + clear, not the post-unsubscribe emit
  });
});

describe("particle lifecycle and contacts", () => {
  test("stop preserves the pool, named manual emissions work, restart resumes the rate", () => {
    const sys = createParticleSystem({ max: 8, rate: 2, lifetime: { min: 3, max: 3 }, speed: { min: 0, max: 0 } });
    sys.update(1);
    sys.stop();
    sys.update(1);
    expect(sys.count()).toBe(2);
    sys.emit(1);
    expect(sys.count()).toBe(3);
    sys.start();
    sys.update(0.5);
    expect(sys.count()).toBe(4);
  });

  test("capacity bounds emission work for huge counts and rates", () => {
    const sys = createParticleSystem({ max: 3, rate: 1e30, lifetime: { min: 10, max: 10 } });
    sys.update(0.1);
    sys.emit(1e30);
    sys.emit(Infinity);
    sys.update(NaN);
    expect(sys.count()).toBe(3);
    expect(Number.isFinite(sys.snapshot().accumulator)).toBe(true);
  });

  test("seed retunes reset future randomness and restore preserves retuned config and stopped state", () => {
    const sys = createParticleSystem({ max: 4, seed: "before", rate: 2, spawnJitter: [2, 2, 2] });
    sys.configure({ seed: "after", gravity: [1, 2, 3] });
    sys.emit(1);
    const twin = createParticleSystem({ max: 4, seed: "after", spawnJitter: [2, 2, 2] });
    twin.emit(1);
    expect(Array.from(sys.buffers().positions)).toEqual(Array.from(twin.buffers().positions));
    sys.stop();
    twin.restore(JSON.parse(JSON.stringify(sys.snapshot())));
    sys.update(0.2);
    twin.update(0.2);
    expect(twin.snapshot()).toEqual(sys.snapshot());
  });

  test("plane contacts kill at the exact intersection and events drain once", () => {
    const sys = createParticleSystem({ max: 3, position: [0, 1, 0], direction: [0, -1, 0], speed: { min: 2, max: 2 }, lifetime: { min: 5, max: 5 }, collision: { planeY: 0 } });
    sys.emit(1);
    sys.update(1);
    expect(sys.count()).toBe(0);
    expect(sys.drainEvents()).toEqual([{ type: "collision", particleId: 1, position: [0, 0, 0], velocity: [0, -2, 0], normal: [0, 1, 0] }]);
    expect(sys.drainEvents()).toEqual([]);
  });

  test("contact queries and retained events remain bounded without draining", () => {
    let queries = 0;
    const sys = createParticleSystem({ max: 5, lifetime: { min: 5, max: 5 }, collision: { response: "bounce", maxQueries: 2, maxEvents: 1 } }, {
      collision: (_from, to) => { queries++; return { position: to, normal: [0, -2, 0] }; },
    });
    sys.emit(5);
    sys.update(0.1);
    sys.update(0.1);
    expect(queries).toBe(4);
    expect(sys.drainEvents()).toHaveLength(1);
    expect(sys.count()).toBe(5);
  });

  test("bounce normal is normalized and restitution sets reflected velocity", () => {
    const sys = createParticleSystem({ max: 1, position: [0, 1, 0], direction: [0, -1, 0], speed: { min: 2, max: 2 }, lifetime: { min: 5, max: 5 }, collision: { response: "bounce", restitution: 0.5 } }, {
      collision: () => ({ position: [0, 0, 0], normal: [0, 3, 0] }),
    });
    sys.emit(1);
    sys.update(1);
    expect(sys.buffers().velocities[1]).toBeCloseTo(1);
    expect(sys.count()).toBe(1);
  });

  test("birth ids and history survive swap removal and replay", () => {
    const sys = createParticleSystem({ max: 3, lifetime: { min: 0.2, max: 0.2 } });
    sys.emit(1);
    sys.configure({ lifetime: { min: 5, max: 5 } });
    sys.emit(2);
    sys.update(0.3);
    expect(Array.from(sys.buffers().ids.subarray(0, sys.count())).sort()).toEqual([2, 3]);
    const twin = createParticleSystem({ max: 3 });
    twin.restore(sys.snapshot());
    expect(twin.snapshot()).toEqual(sys.snapshot());
  });
});


describe("authored particle validation and shared forces", () => {
  test("shared directional and vortex fields update the existing simulation", () => {
    const sys = createParticleSystem({ max: 1, position: [1, 0, 0], speed: { min: 0, max: 0 }, lifetime: { min: 10, max: 10 }, forces: [{ center: [0, 0, 0], shape: { kind: "sphere", radius: 10 }, strength: 2, attenuation: 0, directionality: 1, direction: [0, 1, 0], vortex: { axis: [0, 1, 0], strength: 3 } }] });
    sys.emit(1); sys.update(1);
    expect(Array.from(sys.buffers().velocities)).toEqual([0, 2, -3]);
    expect(Array.from(sys.buffers().positions)).toEqual([1, 2, -3]);
  });

  test("invalid renderable data returns diagnostics without NaN propagation", () => {
    expect(validateEmitterConfig({ rate: NaN, max: Infinity, position: [0, 1], lifetime: { min: -1, max: 0 }, forces: [{ center: [0, 0, 0], strength: 2, shape: { kind: "sphere", radius: -1 } }], collision: { response: "slide", maxEvents: 100000 } })).toHaveLength(7);
    expect(validateEmitterConfig({ rate: 10, max: 512, seed: "saved", collision: { planeY: 0, response: "kill", maxEvents: 16 } })).toEqual([]);
    expect(validateEmitterConfig(null)).toEqual(["emitter must be an object"]);
  });

  test("all render buffers retain their allocation across updates and bursts", () => {
    const sys = createParticleSystem({ max: 32, rate: 5 });
    const initial = sys.buffers();
    sys.update(0.5); sys.emit(5); sys.update(0.1);
    const current = sys.buffers();
    expect(current.positions).toBe(initial.positions);
    expect(current.previousPositions).toBe(initial.previousPositions);
    expect(current.velocities).toBe(initial.velocities);
    expect(current.sizes).toBe(initial.sizes);
    expect(current.colors).toBe(initial.colors);
    expect(current.alphas).toBe(initial.alphas);
    expect(current.ids).toBe(initial.ids);
  });
});

test("surface cone births form a deterministic bounded funnel", () => {
  const config = { max: 32, seed: "funnel", position: [4, 0, 5] as const, spawnShape: { kind: "cone" as const, radius: 3, height: 8, surface: true }, speed: { min: 0, max: 0 } };
  const sys = createParticleSystem(config);
  const twin = createParticleSystem(config);
  sys.emit(32); twin.emit(32);
  const positions = sys.buffers().positions;
  expect(Array.from(positions)).toEqual(Array.from(twin.buffers().positions));
  for (let i = 0; i < sys.count(); i++) {
    const height = positions[i * 3 + 1]!;
    expect(height).toBeGreaterThanOrEqual(0);
    expect(height).toBeLessThanOrEqual(8);
    expect(Math.hypot(positions[i * 3]! - 4, positions[i * 3 + 2]! - 5)).toBeCloseTo(height / 8 * 3, 5);
  }
  expect(validateEmitterConfig({ spawnShape: { kind: "cone", radius: -1, height: Infinity } })).toHaveLength(2);
});

test("complete descriptor replacement clears omitted tuning without clearing live particles", () => {
  const sys = createParticleSystem({ max: 4, rate: 2, gravity: [0, -10, 0], lifetime: { min: 10, max: 10 }, speed: { min: 0, max: 0 } });
  sys.emit(1);
  sys.configure({ max: 4 }, true);
  sys.update(0.1);
  expect(sys.count()).toBe(1);
  expect(sys.buffers().velocities[1]).toBe(0);
  expect(sys.snapshot().config?.rate).toBe(0);
});

test("injected cosmetic forces preserve pause and use retunable caller policy", () => {
  let strength = 2;
  let queries = 0;
  const sys = createParticleSystem({ max: 1, speed: { min: 0, max: 0 }, lifetime: { min: 5, max: 5 } }, {
    acceleration: (_position, _velocity, out) => { queries++; out[0] = strength; out[1] = out[2] = 0; return out; },
  });
  sys.emit(1);
  sys.update(0);
  expect(queries).toBe(0);
  sys.update(0.5);
  expect(sys.buffers().velocities[0]).toBe(1);
  strength = 4;
  sys.update(0.5);
  expect(sys.buffers().velocities[0]).toBe(3);
  const before = sys.snapshot();
  sys.update(0);
  expect(sys.snapshot()).toEqual(before);
});
