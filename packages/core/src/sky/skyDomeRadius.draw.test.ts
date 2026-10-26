import { expect, test } from "bun:test";

import { skyDomeRadius } from "./Daylight.draw";

test("the default sky dome fits inside the camera's far plane", () => {
  expect(skyDomeRadius(undefined, 1000)).toBe(260);
  expect(skyDomeRadius(undefined, 95)).toBeCloseTo(85.5);
  expect(skyDomeRadius(undefined, undefined)).toBe(260);
  expect(skyDomeRadius(400, 95)).toBe(400);
});
