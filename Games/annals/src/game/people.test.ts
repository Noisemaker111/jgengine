import { describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ageNotablesYearly, initPeople, listPeople, monarch } from "./people";

function fakeCtx(day: () => number): GameContext {
  return {
    time: { calendar: () => ({ day: day(), hour: 0, minute: 0, second: 0, dayFraction: 0, totalSeconds: 0 }) },
    game: { feed: { push: () => undefined } },
  } as unknown as GameContext;
}

describe("people", () => {
  test("seeds a monarch and notables, then keeps a monarch across many years of aging", () => {
    initPeople();
    expect(monarch()).toBeDefined();
    expect(listPeople().length).toBe(8);

    let year = 0;
    const ctx = fakeCtx(() => year);
    for (year = 0; year < 300; year += 1) {
      ageNotablesYearly(ctx);
      expect(monarch()).toBeDefined();
      expect(listPeople().length).toBeGreaterThanOrEqual(1);
    }
  });
});
