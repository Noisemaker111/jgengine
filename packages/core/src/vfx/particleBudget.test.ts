import { describe, expect, test } from "bun:test";

import { planParticleBudget } from "./particleBudget";

const entry = (id: string, priority: number, requested: number | undefined) => ({ id, priority, ...(requested === undefined ? {} : { requested }) });

describe("planParticleBudget", () => {
  test("grants every effect when the request fits the cap", () => {
    const plan = planParticleBudget([entry("a", 10, 40), entry("b", 20, 20)], 128);
    expect(plan.grants).toEqual([{ id: "b", particles: 20 }, { id: "a", particles: 40 }]);
    expect(plan.dropped).toEqual([]);
    expect(plan.particles).toBe(60);
  });

  test("drops whole effects lowest priority first when over budget", () => {
    const plan = planParticleBudget([
      entry("weather", 20, 64),
      entry("explosion", 90, 160),
      entry("dust", 40, 96),
      entry("smoke", 60, 192),
    ], 256);
    expect(plan.grants.map((grant) => grant.id)).toEqual(["explosion", "smoke"]);
    expect(plan.dropped).toEqual(["weather", "dust"]);
    expect(plan.particles).toBe(256);
  });

  test("a high-priority effect may take the whole cap, dropping the rest", () => {
    const plan = planParticleBudget([entry("boss", 100, 512), entry("ambient", 1, 32)], 128);
    expect(plan.grants).toEqual([{ id: "boss", particles: 128 }]);
    expect(plan.dropped).toEqual(["ambient"]);
  });

  test("ties keep authoring order and drop the later effect first", () => {
    const plan = planParticleBudget([entry("first", 50, 100), entry("second", 50, 100)], 128);
    expect(plan.grants).toEqual([{ id: "first", particles: 100 }, { id: "second", particles: 28 }]);
    expect(plan.dropped).toEqual([]);
  });

  test("non-finite and negative requests are treated as zero and dropped", () => {
    const plan = planParticleBudget([entry("bad", 10, Number.NaN), entry("negative", 5, -4), entry("ok", 1, 8)], 32);
    expect(plan.grants).toEqual([{ id: "ok", particles: 8 }]);
    expect(plan.dropped).toEqual(["negative", "bad"]);
    expect(plan.particles).toBe(8);
  });

  test("a zero cap admits nothing", () => {
    const plan = planParticleBudget([entry("a", 10, 40)], 0);
    expect(plan.grants).toEqual([]);
    expect(plan.dropped).toEqual(["a"]);
    expect(plan.particles).toBe(0);
  });

  test("an effect cap clamps each request to the tier's per-effect cap before sharing the total", () => {
    const plan = planParticleBudget([entry("big", 1, 2000), entry("small", 1, 40), entry("unsized", 1, undefined)], 10_000, { effectCap: 512 });
    expect(plan.grants).toEqual([{ id: "big", particles: 512 }, { id: "small", particles: 40 }, { id: "unsized", particles: 512 }]);
  });

  test("under an effect cap a zero request still keeps one particle", () => {
    expect(planParticleBudget([entry("tiny", 1, 0)], 100, { effectCap: 128 }).grants).toEqual([{ id: "tiny", particles: 1 }]);
  });

  test("an unlimited cap admits every request", () => {
    const plan = planParticleBudget([entry("a", 1, 300), entry("b", 0, 900)], Infinity);
    expect(plan.dropped).toEqual([]);
    expect(plan.particles).toBe(1200);
  });

  test("bad sizes stay finite integer pools: a fractional request floors and a NaN one takes the effect cap", () => {
    const plan = planParticleBudget([entry("frac", 1, 3.8), entry("nan", 1, Number.NaN)], 1000, { effectCap: 512 });
    expect(plan.grants).toEqual([{ id: "frac", particles: 3 }, { id: "nan", particles: 512 }]);
  });
});
