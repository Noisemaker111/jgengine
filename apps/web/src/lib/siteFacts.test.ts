import { expect, test } from "bun:test";

import { BASELINE_GPU, MEASURED_GAME_COUNT, SCENE_READY_RANGE_MS, WORST_MENU_CLICK_MS, secondsCeil } from "./siteFacts";

test("the home page's load claims hold for the committed load baseline", () => {
  expect(MEASURED_GAME_COUNT).toBeGreaterThan(10);
  expect(WORST_MENU_CLICK_MS).toBeGreaterThan(0);
  expect(WORST_MENU_CLICK_MS).toBeLessThan(1000);
  expect(SCENE_READY_RANGE_MS[0]).toBeLessThanOrEqual(SCENE_READY_RANGE_MS[1]);
  expect(BASELINE_GPU).toBe("RTX 3070");
});

test("rounds milliseconds up to tenths of a second", () => {
  expect(secondsCeil(771)).toBe("0.8 s");
  expect(secondsCeil(800)).toBe("0.8 s");
  expect(secondsCeil(9441)).toBe("9.5 s");
});
