import { describe, expect, it } from "bun:test";

import { DEFAULT_IBL_AMBIENT_SCALE, FALLBACK_KEY_LIGHT, balanceLightingForIbl } from "./lightingBalance";

describe("balanceLightingForIbl", () => {
  it("passes undefined through so sky- and shell-owned defaults still apply", () => {
    expect(balanceLightingForIbl(undefined)).toBeUndefined();
  });

  it("trims ambient and keeps every other authored field", () => {
    const sun = { position: [1, 2, 3] as const, castShadow: true };
    const out = balanceLightingForIbl({ ambient: { color: "#abc", intensity: 0.6 }, directional: [sun] });
    expect(out?.ambient).toEqual({ color: "#abc", intensity: 0.6 * DEFAULT_IBL_AMBIENT_SCALE });
    expect(out?.directional?.[0]).toBe(sun);
  });

  it("adds a shadowless key tinted by the ambient when no directional light is authored", () => {
    const out = balanceLightingForIbl({ ambient: { color: "#d4d5c8", intensity: 0.72 }, hemisphere: { skyColor: "#c7d9df" } });
    expect(out?.directional).toEqual([{ ...FALLBACK_KEY_LIGHT, color: "#d4d5c8" }]);
    expect(out?.directional?.[0]?.castShadow).toBe(false);
  });

  it("honours the opt-outs", () => {
    const lighting = { ambient: { intensity: 0.5 }, iblAmbientScale: 1, fallbackKey: false };
    expect(balanceLightingForIbl(lighting)).toBe(lighting);
    expect(balanceLightingForIbl({ ambient: { intensity: 0.5 }, iblAmbientScale: 0.2, fallbackKey: false })?.ambient?.intensity).toBeCloseTo(0.1);
  });
});
