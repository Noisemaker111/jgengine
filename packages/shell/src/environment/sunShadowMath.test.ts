import { expect, test } from "bun:test";

import { SUN_SHADOW, sunLightPosition, sunShadowFocus } from "./sunShadowMath";

test("the shadow box leads the camera along its horizontal view", () => {
  const focus = sunShadowFocus({ x: 0, z: -7 }, { x: 0, z: 0.96 });
  expect(focus.x).toBeCloseTo(0, 5);
  expect(focus.z).toBeCloseTo(-7 + SUN_SHADOW.lead, 1);
});

test("the focus snaps to whole shadow texels so edges hold still", () => {
  const texel = (SUN_SHADOW.halfExtent * 2) / SUN_SHADOW.mapSize;
  const a = sunShadowFocus({ x: 10.001, z: 3.3 }, { x: 1, z: 0 });
  const b = sunShadowFocus({ x: 10.002, z: 3.3 }, { x: 1, z: 0 });
  expect(a).toEqual(b);
  expect(Math.abs(a.x / texel - Math.round(a.x / texel))).toBeLessThan(1e-9);
});

test("looking straight down centers the box on the camera", () => {
  expect(sunShadowFocus({ x: 4, z: 4 }, { x: 0, z: 0 }).x).toBeCloseTo(4, 1);
});

test("the light sits a fixed distance up the sun direction whatever its magnitude", () => {
  const near = sunLightPosition({ x: 5, z: 5 }, [0, 1, 0]);
  const far = sunLightPosition({ x: 5, z: 5 }, [0, 200, 0]);
  near.forEach((value, axis) => expect(value).toBeCloseTo(far[axis]!, 9));
  expect(near).toEqual([5, SUN_SHADOW.distance, 5]);
  const slanted = sunLightPosition({ x: 0, z: 0 }, [120, 160, 70]);
  expect(Math.hypot(...slanted)).toBeCloseTo(SUN_SHADOW.distance, 6);
});
