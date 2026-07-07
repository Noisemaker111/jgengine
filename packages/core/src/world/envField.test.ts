import { describe, expect, test } from "bun:test";

import { createEnvironmentField } from "./envField";
import { SECONDS_PER_GAME_DAY } from "../time/gameClock";

const NOON = SECONDS_PER_GAME_DAY * 0.5;
const MIDNIGHT = 0;

describe("createEnvironmentField", () => {
  test("sun peaks at noon, negative at midnight", () => {
    const field = createEnvironmentField();
    expect(field.sunElevation(NOON)).toBeCloseTo(1, 5);
    expect(field.sunElevation(MIDNIGHT)).toBeCloseTo(-1, 5);
    expect(field.sunElevation(SECONDS_PER_GAME_DAY * 0.25)).toBeCloseTo(0, 5);
  });

  test("open sky at noon is fully sun-exposed, dark at night", () => {
    const field = createEnvironmentField();
    expect(field.lightExposure(0, 0, NOON)).toBeCloseTo(1, 5);
    expect(field.lightExposure(0, 0, MIDNIGHT)).toBe(0);
  });

  test("occluder shades sun and shelters from rain (V Rising / roofs)", () => {
    const field = createEnvironmentField({
      rain: 0.4,
      occluders: [{ x: 0, z: 0, w: 4, d: 4, shade: 1 }],
    });
    expect(field.lightExposure(0, 0, NOON)).toBe(0);
    expect(field.lightExposure(10, 10, NOON)).toBeGreaterThan(0);
    expect(field.wetness(0, 0, NOON)).toBe(0);
    expect(field.wetness(10, 10, NOON)).toBeCloseTo(0.4, 5);
    expect(field.sample(0, 0, NOON).sheltered).toBe(true);
  });

  test("temperature drops at night and with altitude", () => {
    const field = createEnvironmentField({ baseTemperature: 20, nightDrop: 12, altitudeLapse: 0.5 });
    const noon = field.temperature(0, 0, NOON, 0);
    const night = field.temperature(0, 0, MIDNIGHT, 0);
    expect(noon).toBeCloseTo(20, 5);
    expect(night).toBeCloseTo(8, 5);
    const highNoon = field.temperature(0, 0, NOON, 40);
    expect(highNoon).toBeCloseTo(0, 5);
  });

  test("heat source warms nearby positions (campfire)", () => {
    const field = createEnvironmentField({
      baseTemperature: 0,
      heatSources: [{ x: 0, z: 0, radius: 10, strength: 30 }],
    });
    expect(field.temperature(0, 0, NOON, 0)).toBeCloseTo(30, 5);
    expect(field.temperature(5, 0, NOON, 0)).toBeCloseTo(15, 5);
    expect(field.temperature(20, 0, NOON, 0)).toBeCloseTo(0, 5);
  });

  test("ambient light gates dark spawns even without direct sun", () => {
    const field = createEnvironmentField({ ambientFloor: 0.05 });
    expect(field.ambientLight(0, 0, MIDNIGHT)).toBeCloseTo(0.05, 5);
    expect(field.ambientLight(0, 0, NOON)).toBeCloseTo(1, 5);
  });

  test("rain (clouds) dims direct exposure but not fully", () => {
    const clear = createEnvironmentField({ rain: 0 });
    const stormy = createEnvironmentField({ rain: 1 });
    expect(stormy.lightExposure(0, 0, NOON)).toBeLessThan(clear.lightExposure(0, 0, NOON));
    expect(stormy.lightExposure(0, 0, NOON)).toBeGreaterThan(0);
  });

  test("temperatureAt biome offset shifts the base", () => {
    const field = createEnvironmentField({ baseTemperature: 10, temperatureAt: (x) => (x > 0 ? 25 : -15) });
    expect(field.temperature(5, 0, NOON, 0)).toBeCloseTo(35, 5);
    expect(field.temperature(-5, 0, NOON, 0)).toBeCloseTo(-5, 5);
  });
});
