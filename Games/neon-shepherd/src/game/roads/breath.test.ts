import { describe, expect, test } from "bun:test";
import { TIERS } from "../difficulty/tiers";
import { roadOccupiesBand } from "../vehicles/schedule";
import { forecastGap } from "./breath";
import type { RoadDef } from "./catalog";

const tier = TIERS.restless;

const gappyRoad: RoadDef = {
  id: "test-gappy",
  label: "Test Gappy Road",
  z: 0,
  halfDepth: 3,
  lanes: [{ vehicle: "scooter", direction: 1, laneOffsetZ: 0, period: 4.6, phaseOffset: 0.4 }],
};

describe("gap forecast", () => {
  test("forecast matches the actual occupancy at the window boundaries", () => {
    const forecast = forecastGap(gappyRoad, tier, 0);
    if (forecast.openNow) {
      expect(roadOccupiesBand(gappyRoad, tier, forecast.windowStart, 14)).toBe(false);
      expect(roadOccupiesBand(gappyRoad, tier, forecast.windowEnd, 14)).toBe(true);
    } else {
      expect(roadOccupiesBand(gappyRoad, tier, forecast.windowStart, 14)).toBe(false);
      expect(roadOccupiesBand(gappyRoad, tier, forecast.windowEnd, 14)).toBe(true);
    }
  });

  test("reports openNow correctly against direct occupancy", () => {
    const t = 0;
    const forecast = forecastGap(gappyRoad, tier, t);
    expect(forecast.openNow).toBe(!roadOccupiesBand(gappyRoad, tier, t, 14));
  });

  test("window width is positive and bounded by the scan horizon", () => {
    const forecast = forecastGap(gappyRoad, tier, 1.5);
    expect(forecast.windowWidth).toBeGreaterThan(0);
    expect(forecast.windowWidth).toBeLessThanOrEqual(20.01);
  });

  test("is deterministic for the same road/tier/time", () => {
    const a = forecastGap(gappyRoad, tier, 3.3);
    const b = forecastGap(gappyRoad, tier, 3.3);
    expect(a).toEqual(b);
  });
});
