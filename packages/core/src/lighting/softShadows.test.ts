import { expect, test } from "bun:test";

import { DEFAULT_GRAPHICS_PROFILES } from "@jgengine/core/settings/graphicsProfile";
import { DEFAULT_SHADOW_RADIUS, lightShadowRadius, softShadowRadius, SUN_ANGULAR_DIAMETER_DEG } from "./softShadows";

const map = { frustumWidth: 20, mapSize: 2048, baseRadius: 1.25, maxRadius: 6 };

test("a light with no size keeps the base filter", () => {
  expect(softShadowRadius({ ...map, lightSize: 0 })).toBe(1.25);
  expect(softShadowRadius({ ...map, lightSize: Number.NaN })).toBe(1.25);
});

test("the penumbra widens with the light's size and caster distance, bounded by the tier", () => {
  const sun = softShadowRadius({ ...map, lightSize: SUN_ANGULAR_DIAMETER_DEG });
  const haze = softShadowRadius({ ...map, lightSize: 2 });
  expect(sun).toBeGreaterThan(1.25);
  expect(haze).toBeGreaterThan(sun);
  expect(softShadowRadius({ ...map, lightSize: 2, occluderDistance: 1 })).toBeLessThan(haze);
  expect(softShadowRadius({ ...map, lightSize: 30 })).toBe(6);
  expect(softShadowRadius({ ...map, lightSize: 1e9 })).toBe(6);
});

test("a coarse cascade gets fewer texels of penumbra than a fine one, never below the base", () => {
  const near = softShadowRadius({ ...map, lightSize: 1 });
  const far = softShadowRadius({ ...map, lightSize: 1, frustumWidth: 400 });
  expect(far).toBeLessThan(near);
  expect(far).toBe(1.25);
});

test("monotone and finite across the whole dial", () => {
  let last = 0;
  for (let size = 0; size <= 30; size += 0.25) {
    const radius = softShadowRadius({ ...map, lightSize: size });
    expect(Number.isFinite(radius)).toBe(true);
    expect(radius).toBeGreaterThanOrEqual(last);
    last = radius;
  }
});

test("a tier that pays for no softening keeps the base filter", () => {
  expect(softShadowRadius({ ...map, lightSize: 5, maxRadius: 0 })).toBe(1.25);
});

test("a light's radius widens only when it sets a size and the player's soft shadows are on", () => {
  const high = DEFAULT_GRAPHICS_PROFILES.high;
  const sun = { position: [10, 20, 5] as const, castShadow: true, lightSize: 2 };
  expect(lightShadowRadius({ position: [10, 20, 5] }, high, 20, 2048)).toBe(DEFAULT_SHADOW_RADIUS);
  expect(lightShadowRadius(sun, high, 20, 2048)).toBeGreaterThan(DEFAULT_SHADOW_RADIUS);
  expect(lightShadowRadius(sun, { ...high, softShadows: false }, 20, 2048)).toBe(DEFAULT_SHADOW_RADIUS);
  expect(lightShadowRadius(sun, DEFAULT_GRAPHICS_PROFILES.low, 20, 2048)).toBe(DEFAULT_SHADOW_RADIUS);
  expect(lightShadowRadius(sun, undefined, 20, 2048)).toBe(DEFAULT_SHADOW_RADIUS);
});
