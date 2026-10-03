import { describe, expect, test } from "bun:test";

import { resolveParticleBudget, specNeedsRender, transformParticleVector, resolveParticleDelta } from "./WorldParticles";

describe("resolveParticleBudget", () => {
  test("clamps the requested pool to the tier cap", () => {
    expect(resolveParticleBudget("high", 2000)).toBe(512);
    expect(resolveParticleBudget("medium", 2000)).toBe(256);
    expect(resolveParticleBudget("low", 2000)).toBe(128);
  });

  test("keeps a small request as-is and defaults to the cap", () => {
    expect(resolveParticleBudget("low", 40)).toBe(40);
    expect(resolveParticleBudget("high", undefined)).toBe(512);
  });

  test("never returns less than one particle", () => {
    expect(resolveParticleBudget("high", 0)).toBe(1);
  });
});

describe("specNeedsRender", () => {
  const base = { id: "e", config: { rate: 4 } } as const;

  test("blending, follow, and offset changes need a render", () => {
    expect(specNeedsRender({ ...base }, { ...base, blending: "additive" })).toBe(true);
    expect(specNeedsRender({ ...base }, { ...base, follow: "kart" })).toBe(true);
    expect(specNeedsRender({ ...base }, { ...base, offset: [0, 1, 0] })).toBe(true);
    expect(specNeedsRender({ ...base, offset: [0, 1, 0] }, { ...base, offset: [0, 2, 0] })).toBe(true);
  });

  test("config-only retunes stay render-free", () => {
    expect(specNeedsRender({ ...base }, { ...base, config: { rate: 32 } })).toBe(false);
    expect(specNeedsRender({ ...base, offset: [0, 1, 0] }, { ...base, offset: [0, 1, 0] })).toBe(false);
  });
});


describe("particle spaces and output retunes", () => {
  test("local yaw and translation round trip while world vectors retain their positions", () => {
    const point = [1, 2, 3] as const;
    const origin = [10, 20, 30] as const;
    const world = transformParticleVector(point, origin, Math.PI / 2);
    expect(world[0]).toBeCloseTo(13);
    expect(world[1]).toBeCloseTo(22);
    expect(world[2]).toBeCloseTo(29);
    const restored = transformParticleVector(world, origin, Math.PI / 2, true);
    restored.forEach((v, i) => expect(v).toBeCloseTo(point[i]!));
  });

  test("simulation lifecycle stays imperative but output and space retunes render", () => {
    const base = { id: "a", config: {} };
    expect(specNeedsRender(base, { ...base, active: false })).toBe(false);
    expect(specNeedsRender(base, { ...base, space: "local" })).toBe(true);
    expect(specNeedsRender(base, { ...base, render: { shape: "streak" } })).toBe(true);
    expect(specNeedsRender({ ...base, render: { shape: "streak", stretch: 1 } }, { ...base, render: { shape: "streak", stretch: 2 } })).toBe(true);
  });

  test("bad visual budgets remain finite integer pool bounds", () => {
    expect(resolveParticleBudget("high", NaN, Infinity)).toBe(512);
    expect(resolveParticleBudget("low", 3.8)).toBe(3);
  });
});


test("visual particle time follows pause, scaled game time, and bounded suspension catch-up", () => {
  expect(resolveParticleDelta(10, 10)).toBe(0);
  expect(resolveParticleDelta(10, 10.032)).toBeCloseTo(0.032);
  expect(resolveParticleDelta(10, 30)).toBe(0.1);
  expect(resolveParticleDelta(10, 2)).toBe(0);
  expect(resolveParticleDelta(10, NaN)).toBe(0);
});
