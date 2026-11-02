import { describe, expect, test } from "bun:test";
import { getDailyModifier, type DailyMarketModifier } from "@llmville/game/economy/dailyMarket";

const JANUARY_2026 = ["off_peak_power","heat_wave","batch_bounty","reasoning_demand_spike","frontier_release","off_peak_power","heat_wave","batch_bounty","reasoning_demand_spike","off_peak_power","frontier_release","reasoning_demand_spike","batch_bounty","frontier_release","reasoning_demand_spike","batch_bounty","heat_wave","reasoning_demand_spike","batch_bounty","heat_wave","batch_bounty","frontier_release","off_peak_power","batch_bounty","reasoning_demand_spike","off_peak_power","heat_wave","frontier_release","off_peak_power","batch_bounty","heat_wave"];

describe("daily market", () => {
  test("every UTC day keeps the modifier it always had", () => {
    const picked = JANUARY_2026.map((_, day) => getDailyModifier(new Date(Date.UTC(2026, 0, 1 + day, 12))).type);
    expect(picked).toEqual(JANUARY_2026);
  });

  test("the same day gives the same modifier at any hour", () => {
    expect(getDailyModifier(new Date(Date.UTC(2026, 0, 5, 0, 0, 1))).type).toBe(getDailyModifier(new Date(Date.UTC(2026, 0, 5, 23, 59))).type);
  });

  test("each modifier keeps its numbers", () => {
    const byType = new Map<string, DailyMarketModifier>(JANUARY_2026.map((_, day) => {
      const modifier = getDailyModifier(new Date(Date.UTC(2026, 0, 1 + day, 12)));
      return [modifier.type, modifier] as const;
    }));
    const numbers = (type: string) => {
      const modifier = byType.get(type);
      if (modifier === undefined) throw new Error(type);
      const { revenueMult, reasoningRevenueMult, dataYieldMult, ambientCoolingMult, electricityMult, frontierJump } = modifier;
      return [revenueMult, reasoningRevenueMult, dataYieldMult, ambientCoolingMult, electricityMult, frontierJump];
    };
    expect(numbers("reasoning_demand_spike")).toEqual([1, 2, 1, 1, 1, 0]);
    expect(numbers("batch_bounty")).toEqual([1, 1, 1.5, 1, 1, 0]);
    expect(numbers("heat_wave")).toEqual([1, 1, 1, 0.7, 1.2, 0]);
    expect(numbers("off_peak_power")).toEqual([1, 1, 1, 1, 0.6, 0]);
    expect(numbers("frontier_release")).toEqual([1, 1, 1, 1, 1, 5]);
  });

  test("a modifier carries exactly the fields the Convex validator returns", () => {
    expect(Object.keys(getDailyModifier(new Date(Date.UTC(2026, 0, 1)))).sort()).toEqual(
      ["ambientCoolingMult", "dataYieldMult", "description", "electricityMult", "frontierJump", "label", "reasoningRevenueMult", "revenueMult", "type"],
    );
  });
});
