import { describe, expect, test } from "bun:test";

import { EN1991_PUBLISHED, EN1991_TERRAIN, exposureFactor, logLawRatio, spectralDensity, spectralShare, terrainFactor, turbulenceIntensity, turbulenceLength } from "./windProfile";

const CLASSES = ["openWater", "grass", "forest", "city"] as const;

describe("EN 1991-1-4 reference wind", () => {
  test("reproduces the published terrain factor and turbulence intensity per category", () => {
    for (const name of CLASSES) {
      expect(terrainFactor(EN1991_TERRAIN[name])).toBeCloseTo(EN1991_PUBLISHED.terrainFactor[name], 3);
      expect(turbulenceIntensity(EN1991_TERRAIN[name], 10)).toBeCloseTo(EN1991_PUBLISHED.intensityAt10m[name], 3);
    }
  });

  test("reproduces the length scale and exposure factor at 10 m over grass", () => {
    expect(turbulenceLength(EN1991_TERRAIN.grass, 10)).toBeCloseTo(EN1991_PUBLISHED.lengthScaleAt10mGrass, 1);
    expect(exposureFactor(EN1991_TERRAIN.grass, 10)).toBeCloseTo(EN1991_PUBLISHED.exposureAt10mGrass, 2);
  });

  test("the spectrum integrates to one and peaks where the standard says", () => {
    expect(spectralShare(1e-6, 1e6)).toBeCloseTo(1, 2);
    expect(spectralDensity(EN1991_PUBLISHED.spectrumPeak.fL)).toBeCloseTo(EN1991_PUBLISHED.spectrumPeak.value, 3);
    expect(spectralDensity(0.1)).toBeLessThan(spectralDensity(0.147));
    expect(spectralDensity(0.2)).toBeLessThan(spectralDensity(0.147));
  });

  test("the log law grows with height, faster over rough ground", () => {
    expect(logLawRatio(EN1991_TERRAIN.grass, 50)).toBeGreaterThan(1.25);
    expect(logLawRatio(EN1991_TERRAIN.city, 50)).toBeGreaterThan(logLawRatio(EN1991_TERRAIN.grass, 50));
    expect(logLawRatio(EN1991_TERRAIN.openWater, 1)).toBeLessThan(1);
    expect(logLawRatio(EN1991_TERRAIN.city, 2)).toBe(1);
  });
});
