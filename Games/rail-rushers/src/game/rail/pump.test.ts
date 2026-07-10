import { describe, expect, test } from "bun:test";
import { classifyPump, PUMP_TIERS, pumpSpeedBonus } from "./pump";

describe("pump cadence bonus table", () => {
  test("has distinct tiers with non-negative bonuses", () => {
    expect(PUMP_TIERS.length).toBeGreaterThanOrEqual(3);
    for (const tier of PUMP_TIERS) expect(tier.speedBonus).toBeGreaterThanOrEqual(0);
  });

  test("a mid-window interval scores perfect", () => {
    expect(classifyPump(0.5).id).toBe("perfect");
    expect(pumpSpeedBonus(0.5)).toBeGreaterThan(0);
  });

  test("a slightly-off interval scores good, not perfect", () => {
    expect(classifyPump(0.65).id).toBe("good");
  });

  test("too fast a re-press scores no bonus", () => {
    expect(classifyPump(0.05).id).toBe("early");
    expect(pumpSpeedBonus(0.05)).toBe(0);
  });

  test("too slow a re-press scores no bonus", () => {
    expect(classifyPump(4).id).toBe("late");
    expect(pumpSpeedBonus(4)).toBe(0);
  });

  test("perfect tier bonus exceeds good tier bonus", () => {
    const perfect = PUMP_TIERS.find((t) => t.id === "perfect")!;
    const good = PUMP_TIERS.find((t) => t.id === "good")!;
    expect(perfect.speedBonus).toBeGreaterThan(good.speedBonus);
  });

  test("negative interval never crashes and scores no bonus", () => {
    expect(() => classifyPump(-1)).not.toThrow();
    expect(pumpSpeedBonus(-1)).toBe(0);
  });
});
