import { describe, expect, test } from "bun:test";

import { lightingZoneWeight, sampleLightingZones, type LightingZone } from "./lightingZones";

const BASE = { keyColor: "#ffffff", ambientColor: "#ffffff", skyColor: "#f0f0f0", groundColor: "#808080" };

const SHOWROOM: LightingZone = {
  area: { w: 100, d: 200, position: [0, -1000] },
  fade: 20,
  key: { intensity: 0.2, color: "#000000" },
  fill: { intensity: 0.4, color: "#000000", groundColor: "#000000" },
  environment: 0.3,
  exposure: 0.5,
};

describe("lighting zones", () => {
  test("a zone weighs 1 inside, eases out across its fade, and is gone past it", () => {
    expect(lightingZoneWeight(SHOWROOM, 0, -1000)).toBe(1);
    expect(lightingZoneWeight(SHOWROOM, 50, -900)).toBe(1);
    expect(lightingZoneWeight(SHOWROOM, 0, -890)).toBeCloseTo(0.5, 5);
    expect(lightingZoneWeight(SHOWROOM, 0, -880)).toBe(0);
    expect(lightingZoneWeight(SHOWROOM, 0, 0)).toBe(0);
    expect(lightingZoneWeight({ area: { w: 10, d: 10 } }, 5 + 12, 0)).toBeCloseTo(1 - 0.5 * 0.5 * (3 - 1), 5);
  });

  test("outside every zone the base rig comes back unchanged", () => {
    expect(sampleLightingZones([SHOWROOM], 0, 0, BASE)).toEqual({
      key: 1, keyColor: "#ffffff", fill: 1, ambientColor: "#ffffff", skyColor: "#f0f0f0", groundColor: "#808080", environment: 1, exposure: 1, emissive: {},
    });
    expect(sampleLightingZones([], 0, -1000, BASE).key).toBe(1);
  });

  test("inside a zone its values replace the base; at the boundary they blend halfway", () => {
    expect(sampleLightingZones([SHOWROOM], 0, -1000, BASE)).toEqual({
      key: 0.2, keyColor: "#000000", fill: 0.4, ambientColor: "#000000", skyColor: "#000000", groundColor: "#000000", environment: 0.3, exposure: 0.5, emissive: {},
    });
    const edge = sampleLightingZones([SHOWROOM], 0, -890, BASE);
    expect(edge.key).toBeCloseTo(0.6, 5);
    expect(edge.fill).toBeCloseTo(0.7, 5);
    expect(edge.exposure).toBeCloseTo(0.75, 5);
    expect(edge.keyColor).toBe("#808080");
    expect(edge.groundColor).toBe("#404040");
  });

  test("a zone dims its named emissive light groups and blends them at its edge", () => {
    const showroom: LightingZone = { ...SHOWROOM, emissive: { house: 0.1 } };
    expect(sampleLightingZones([showroom], 0, -1000, BASE).emissive).toEqual({ house: 0.1 });
    expect(sampleLightingZones([showroom], 0, -890, BASE).emissive.house).toBeCloseTo(0.55, 5);
    // Outside every zone no group is named, so nothing is touched.
    expect(sampleLightingZones([showroom], 0, 0, BASE).emissive).toEqual({});
  });

  test("unset fields keep the base, and a later overlapping zone wins", () => {
    const dock: LightingZone = { area: { w: 100, d: 100, position: [0, -1000] }, key: { color: "#ff9a3c" } };
    const both = sampleLightingZones([SHOWROOM, dock], 0, -1000, BASE);
    expect(both.keyColor).toBe("#ff9a3c");
    expect(both.key).toBe(0.2);
    const tintOnly = sampleLightingZones([dock], 0, -1000, BASE);
    expect(tintOnly.key).toBe(1);
    expect(tintOnly.fill).toBe(1);
    expect(tintOnly.ambientColor).toBe("#ffffff");
  });
});
