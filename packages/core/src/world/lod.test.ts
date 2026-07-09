import { describe, expect, test } from "bun:test";
import { createLodScheduler } from "@jgengine/core/world/lod";

describe("lod bandIndex", () => {
  test("inclusive maxDistance boundaries and sorts unsorted input", () => {
    const scheduler = createLodScheduler({
      bands: [
        { maxDistance: 100, interval: 1 },
        { maxDistance: 10, interval: 0 },
        { maxDistance: 50, interval: 0.5 },
      ],
    });
    expect(scheduler.bandIndex(10)).toBe(0);
    expect(scheduler.bandIndex(10.001)).toBe(1);
    expect(scheduler.bandIndex(50)).toBe(1);
    expect(scheduler.bandIndex(100)).toBe(2);
    expect(scheduler.bandIndex(0)).toBe(0);
  });

  test("returns -1 beyond the last band", () => {
    const scheduler = createLodScheduler({ bands: [{ maxDistance: 100, interval: 1 }] });
    expect(scheduler.bandIndex(100.5)).toBe(-1);
    expect(scheduler.bandIndex(10000)).toBe(-1);
  });
});

describe("lod step interval 0", () => {
  test("returns the full accumulated dt every call", () => {
    const scheduler = createLodScheduler({
      bands: [{ maxDistance: 10, interval: 0 }],
      stagger: false,
    });
    expect(scheduler.step("e", 5, 0.016)).toBeCloseTo(0.016);
    expect(scheduler.step("e", 5, 0.02)).toBeCloseTo(0.02);
  });
});

describe("lod step interval accumulation", () => {
  test("accumulates several small dts then releases the full bucket", () => {
    const scheduler = createLodScheduler({
      bands: [{ maxDistance: 10, interval: 1 }],
      stagger: false,
    });
    expect(scheduler.step("e", 5, 0.3)).toBe(0);
    expect(scheduler.step("e", 5, 0.3)).toBe(0);
    expect(scheduler.step("e", 5, 0.3)).toBe(0);
    expect(scheduler.step("e", 5, 0.3)).toBeCloseTo(1.2);
    expect(scheduler.step("e", 5, 0.3)).toBe(0);
  });
});

describe("lod step band changes mid-accumulation", () => {
  test("carries accumulated bucket across a band change", () => {
    const scheduler = createLodScheduler({
      bands: [
        { maxDistance: 10, interval: 0.1 },
        { maxDistance: 100, interval: 2 },
      ],
      stagger: false,
    });
    expect(scheduler.step("e", 5, 0.05)).toBe(0);
    expect(scheduler.step("e", 80, 0.05)).toBe(0);
    expect(scheduler.step("e", 80, 2)).toBeCloseTo(2.1);
  });
});

describe("lod beyondInterval null culling", () => {
  test("returns 0 repeatedly while beyond range, releases capped bucket on re-entry", () => {
    const scheduler = createLodScheduler({
      bands: [{ maxDistance: 10, interval: 0.5 }],
      beyondInterval: null,
      stagger: false,
    });
    expect(scheduler.step("e", 50, 100)).toBe(0);
    expect(scheduler.step("e", 50, 100)).toBe(0);
    expect(scheduler.step("e", 50, 100)).toBe(0);
    expect(scheduler.step("e", 5, 0)).toBeCloseTo(60);
  });
});

describe("lod beyondInterval numeric", () => {
  test("ticks far entities on the beyond interval", () => {
    const scheduler = createLodScheduler({
      bands: [{ maxDistance: 10, interval: 0.5 }],
      beyondInterval: 5,
      stagger: false,
    });
    expect(scheduler.step("e", 50, 2)).toBe(0);
    expect(scheduler.step("e", 50, 2)).toBe(0);
    expect(scheduler.step("e", 50, 2)).toBeCloseTo(6);
    expect(scheduler.step("e", 50, 2)).toBe(0);
  });
});

describe("lod stagger", () => {
  test("gives two different ids different first-release values", () => {
    const scheduler = createLodScheduler({ bands: [{ maxDistance: 10, interval: 2 }] });
    const v1 = scheduler.step("e1", 5, 2);
    const v2 = scheduler.step("e2", 5, 2);
    expect(v1).toBeGreaterThanOrEqual(2);
    expect(v2).toBeGreaterThanOrEqual(2);
    expect(v1).not.toBeCloseTo(v2);
  });

  test("gives the same id a deterministic phase across separate schedulers", () => {
    const config = { bands: [{ maxDistance: 10, interval: 2 }] };
    const a = createLodScheduler(config);
    const b = createLodScheduler(config);
    const va = a.step("unit", 5, 2);
    const vb = b.step("unit", 5, 2);
    expect(va).toBeCloseTo(vb);
  });

  test("stagger false starts buckets at 0", () => {
    const scheduler = createLodScheduler({
      bands: [{ maxDistance: 10, interval: 2 }],
      stagger: false,
    });
    expect(scheduler.step("e", 5, 2)).toBeCloseTo(2);
  });
});

describe("lod remove / negative dt / size / clear", () => {
  test("remove forgets accumulated time", () => {
    const scheduler = createLodScheduler({
      bands: [{ maxDistance: 10, interval: 1 }],
      stagger: false,
    });
    scheduler.step("e", 5, 0.9);
    scheduler.remove("e");
    expect(scheduler.step("e", 5, 1)).toBeCloseTo(1);
  });

  test("negative dt is ignored", () => {
    const scheduler = createLodScheduler({
      bands: [{ maxDistance: 10, interval: 1 }],
      stagger: false,
    });
    expect(scheduler.step("e", 5, -5)).toBe(0);
    expect(scheduler.step("e", 5, 1)).toBeCloseTo(1);
  });

  test("size and clear manage the id set", () => {
    const scheduler = createLodScheduler({
      bands: [{ maxDistance: 10, interval: 1 }],
      stagger: false,
    });
    scheduler.step("a", 5, 0.1);
    scheduler.step("b", 5, 0.1);
    expect(scheduler.size()).toBe(2);
    scheduler.clear();
    expect(scheduler.size()).toBe(0);
  });
});
