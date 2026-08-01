import { describe, expect, test } from "bun:test";

import { resolveParticleBudget } from "./WorldParticles";

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
