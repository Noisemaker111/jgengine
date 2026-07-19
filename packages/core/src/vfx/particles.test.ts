import { describe, expect, test } from "bun:test";

import { createParticleSystem } from "./particles";

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
