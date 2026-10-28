import { expect, test } from "bun:test";

import { toonRampKey, toonRampTexels } from "./toonRamp";

test("a hard ramp has exactly its bands, dark to light", () => {
  const texels = toonRampTexels({ bands: 3, softness: 0, shadow: 0.2 });
  expect([...new Set(texels)]).toEqual([51, 153, 255]);
  for (let i = 1; i < texels.length; i += 1) expect(texels[i] ?? 0).toBeGreaterThanOrEqual(texels[i - 1] ?? 0);
});

test("a soft ramp blends its steps and stays monotone", () => {
  const texels = toonRampTexels({ bands: 3, softness: 1, shadow: 0.2 });
  expect(new Set(texels).size).toBeGreaterThan(3);
  for (let i = 1; i < texels.length; i += 1) expect(texels[i] ?? 0).toBeGreaterThanOrEqual(texels[i - 1] ?? 0);
});

test("keys clamp out-of-range ramps to the same material", () => {
  expect(toonRampKey({ bands: 20, softness: -1, shadow: 2 })).toBe(toonRampKey({ bands: 8, softness: 0, shadow: 1 }));
});
