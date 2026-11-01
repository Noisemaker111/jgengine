import { describe, expect, test } from "bun:test";

import { crownBalanceLean, crownShownLean } from "./vehicleTireCrown";

const DEG = Math.PI / 180;

describe("tireCrown", () => {
  test("a sport bike rolled to 45° on 7.5 cm crowns balances at about 39.5°, 0.82 g", () => {
    const balance = crownBalanceLean({}, 0.566, 45 * DEG, 1);
    expect(balance / DEG).toBeCloseTo(39.5, 0);
    expect(Math.tan(balance)).toBeCloseTo(0.82, 1);
    expect(crownShownLean({}, 0.566, balance, 1)).toBeCloseTo(45 * DEG, 9);
  });

  test("the extra lean grows monotonically with the dial, none at 0, and stays finite at the top", () => {
    const leans = [0, 0.2, 1, 2, 4, 40].map((strength) => crownShownLean({}, 0.566, 30 * DEG, strength));
    expect(leans[0]).toBe(30 * DEG);
    for (let i = 1; i < leans.length; i += 1) expect(leans[i] ?? 0).toBeGreaterThanOrEqual(leans[i - 1] ?? 0);
    for (const lean of leans) expect(lean).toBeLessThan(Math.PI / 2);
    expect(crownShownLean({}, 0.566, -0.3, 1)).toBeCloseTo(-crownShownLean({}, 0.566, 0.3, 1), 12);
  });
});
