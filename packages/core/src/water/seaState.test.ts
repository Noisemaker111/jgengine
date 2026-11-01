import { describe, expect, test } from "bun:test";

import { createWaveField, regularWaveField, seaSpectrumDensity, waveFieldHeight, waveFieldSignificantHeight } from "./seaState";

describe("seaState", () => {
  test("a seeded field is the same sea every time and carries the spectrum's significant height", () => {
    const spectrum = { significantHeight: 2, peakPeriod: 8, peakEnhancement: 3.3 };
    const a = createWaveField(spectrum, { seed: "storm", components: 96 });
    const b = createWaveField(spectrum, { seed: "storm", components: 96 });
    expect(waveFieldHeight(a, 12, -4, 3.5)).toBe(waveFieldHeight(b, 12, -4, 3.5));
    expect(waveFieldHeight(createWaveField(spectrum, { seed: "calm", components: 96 }), 12, -4, 3.5)).not.toBe(waveFieldHeight(a, 12, -4, 3.5));
    expect(Math.abs(waveFieldSignificantHeight(a) / 2 - 1)).toBeLessThan(0.08);
    expect(a.components[0]?.amplitude).toBeGreaterThanOrEqual(a.components[1]?.amplitude ?? 0);
  });

  test("JONSWAP peaks higher than Pierson–Moskowitz at the peak frequency", () => {
    const wp = (2 * Math.PI) / 8;
    expect(seaSpectrumDensity({ significantHeight: 2, peakPeriod: 8, peakEnhancement: 3.3 }, wp)).toBeGreaterThan(seaSpectrumDensity({ significantHeight: 2, peakPeriod: 8 }, wp));
  });

  test("a regular wave travels toward its direction at the deep-water phase speed", () => {
    const field = regularWaveField(0.5, 6, Math.PI / 2, { level: 1 });
    const c = 9.81 / ((2 * Math.PI) / 6);
    expect(waveFieldHeight(field, 0, 0, 0)).toBeCloseTo(1.5, 9);
    expect(waveFieldHeight(field, 0, c * 2, 2)).toBeCloseTo(1.5, 6);
  });
});
