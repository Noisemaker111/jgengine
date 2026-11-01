import { describe, expect, test } from "bun:test";

import { tickCooldown } from "./cooldown";

describe("tick cooldown", () => {
  test("counts down to 0 and stays there", () => {
    expect(tickCooldown(1, 0.25)).toBe(0.75);
    expect(tickCooldown(0.25, 0.25)).toBe(0);
    expect(tickCooldown(0.1, 5)).toBe(0);
    expect(tickCooldown(0, 1)).toBe(0);
  });
});
