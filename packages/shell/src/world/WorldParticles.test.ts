import { describe, expect, test } from "bun:test";

import { resolveParticleBudget, specNeedsRender } from "./WorldParticles";

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
