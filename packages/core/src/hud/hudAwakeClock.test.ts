import { expect, test } from "bun:test";
import { createHudAwakeClock } from "./hudAwakeClock";

test("quiet readings dim, changed readings wake, and alarms hold the HUD awake", () => {
  let now = 0;
  const clock = createHudAwakeClock(4000, () => now);
  expect(clock.awake([100, 9], false)).toBe(true);
  now = 4000;
  expect(clock.awake([100, 9], false)).toBe(false);
  expect(clock.awake([100, 9], true)).toBe(true);
  expect(clock.awake([100, 8], false)).toBe(true);
  now = 8000;
  expect(clock.awake([100, 8], false)).toBe(false);
});
