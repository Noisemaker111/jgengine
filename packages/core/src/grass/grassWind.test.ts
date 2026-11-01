import { describe, expect, test } from "bun:test";

import { windField } from "../world/wind";
import { GRASS_DEFAULTS } from "./grassKind";
import { GRASS_WIND_REFERENCE_SPEED, grassSwayAmplitude, grassWindAt, grassWindLook } from "./grassWind";

const DIALS = [0, 0.2, 1, 2, 4];

describe("grass in the shared wind", () => {
  test("response dial: sway amplitude is finite, bounded and monotone over 0..4, zero when off", () => {
    const sway = DIALS.map((response) => grassSwayAmplitude({ ...grassWindLook(GRASS_DEFAULTS, [8, 0], response), stiffness: GRASS_DEFAULTS.stiffness }));
    expect(sway[0]).toBe(0);
    const ceiling = grassSwayAmplitude({ windStrength: 1, stiffness: GRASS_DEFAULTS.stiffness });
    for (let k = 1; k < DIALS.length; k += 1) {
      expect(Number.isFinite(sway[k] ?? Number.NaN)).toBe(true);
      expect(sway[k] ?? 0).toBeGreaterThan(sway[k - 1] ?? 0);
      expect(sway[k] ?? 0).toBeLessThan(ceiling);
    }
  });

  test("at the reference breeze and response 1 the kind keeps about its own sway", () => {
    const look = grassWindLook(GRASS_DEFAULTS, [GRASS_WIND_REFERENCE_SPEED, 0]);
    expect(look.windStrength).toBeGreaterThan(0.85 * GRASS_DEFAULTS.windStrength);
    expect(look.windStrength).toBeLessThanOrEqual(GRASS_DEFAULTS.windStrength);
    expect(look.windSpeed).toBeCloseTo(GRASS_DEFAULTS.windSpeed, 9);
  });

  test("blades lean the way the field blows, and harder in a stronger wind", () => {
    const field = windField({ direction: [0, 1], speed: 9 });
    const look = grassWindLook(GRASS_DEFAULTS, grassWindAt({ field }, 3, 4, 1));
    expect(look.windDirection).toBeCloseTo(90, 9);
    expect(look.windStrength).toBeGreaterThan(grassWindLook(GRASS_DEFAULTS, [4, 0]).windStrength);
  });

  test("still air keeps the look's heading and rejects a negative response", () => {
    expect(grassWindLook(GRASS_DEFAULTS, [0, 0]).windDirection).toBe(GRASS_DEFAULTS.windDirection);
    expect(() => grassWindLook(GRASS_DEFAULTS, [1, 0], -1)).toThrow();
  });
});
