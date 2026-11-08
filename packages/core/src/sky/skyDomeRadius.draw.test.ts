import { expect, test } from "bun:test";

import { SKY_RENDER_ORDER, skyDomeRadius } from "./Daylight.draw";

test("the default sky dome fits inside the camera's far plane", () => {
  expect(skyDomeRadius(undefined, 1000)).toBe(260);
  expect(skyDomeRadius(undefined, 95)).toBeCloseTo(85.5);
  expect(skyDomeRadius(undefined, undefined)).toBe(260);
  expect(skyDomeRadius(400, 95)).toBe(400);
});

test("the dome draws after the default opaque order and before the overlays", () => {
  // Drawn first, the dome shaded every pixel the opaque scene then covered; overlays (997-999) that
  // skip depth must still land on top of it.
  expect(SKY_RENDER_ORDER).toBeGreaterThan(0);
  expect(SKY_RENDER_ORDER).toBeLessThan(997);
});
