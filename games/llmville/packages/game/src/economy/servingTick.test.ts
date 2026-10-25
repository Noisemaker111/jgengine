import { applyCurrencyOperation } from "@jgengine/core/economy/currency";
import { CURRENCIES } from "@llmville/game/economy/currency";
import { describe, expect, test } from "bun:test";
import {
  computeServingTickGain,
  computeServingTickTiming,
  nextServingTickAnchor,
  decideScrapingTick,
  scrapingTickCanBeSkipped,
} from "@llmville/game/economy/servingTick";
import { INFRASTRUCTURE_BUILD_ITEM_ID_VALUES } from "@llmville/game/build/catalog";
import { HARDWARE_MODEL_ID_VALUES } from "@llmville/game/infrastructure/catalog";
import { assignmentKey, type RackSnapshot } from "@llmville/game/infrastructure/infrastructure";

describe("servingTick", () => {
  test("a long offline gap is capped once without banking its unpaid backlog", () => {
    const now = 3_601_750;
    const timing = computeServingTickTiming(1_000, now);
    expect(timing.elapsedSeconds).toBe(60);
    const nextAnchor = nextServingTickAnchor(timing);
    expect(nextAnchor).toBe(3_601_000);

    const repeated = computeServingTickTiming(nextAnchor, now);
    expect(repeated.elapsedSeconds).toBe(0);
    expect(nextServingTickAnchor(repeated)).toBe(nextAnchor);

    const following = computeServingTickTiming(nextAnchor, now + 250);
    expect(following.elapsedSeconds).toBe(1);
    expect(nextServingTickAnchor(following)).toBe(now + 250);
  });

  test("ordinary ticks carry fractional seconds into the following interval", () => {
    const timing = computeServingTickTiming(1_250, 2_999);
    expect(timing.elapsedSeconds).toBe(1);
    expect(nextServingTickAnchor(timing)).toBe(2_250);
    const following = computeServingTickTiming(nextServingTickAnchor(timing), 3_250);
    expect(following.elapsedSeconds).toBe(1);
    expect(nextServingTickAnchor(following)).toBe(3_250);
  });

  test("clock rollback cannot move a persisted serving anchor backward or pay twice", () => {
    const timing = computeServingTickTiming(5_250, 4_000);
    expect(timing.elapsedSeconds).toBe(0);
    expect(nextServingTickAnchor(timing)).toBe(5_250);
    const resumed = computeServingTickTiming(nextServingTickAnchor(timing), 6_250);
    expect(resumed.elapsedSeconds).toBe(1);
    expect(nextServingTickAnchor(resumed)).toBe(6_250);
  });

  test("computeServingTickGain scales gain by elapsed seconds", () => {
    expect(computeServingTickGain(12, 5)).toBe(60);
    expect(computeServingTickGain(0, 30)).toBe(0);
  });

  test("serving income rounds once when credited to the engine wallet", () => {
    expect(computeServingTickGain(0.005, 2)).toBe(0.01);
    expect(applyCurrencyOperation(CURRENCIES.money, 0, "add", computeServingTickGain(0.0554, 60))).toMatchObject({ success: true, newBalance: 3.32 });
  });

  test("income math preserves fractional earnings until the wallet write", () => {
    expect(computeServingTickGain(0.001, 2)).toBe(0.002);
  });
});

describe("scrapingTickCanBeSkipped", () => {
  const now = 10_000_000;

  test("never skips a game whose anchor has not been set", () => {
    expect(scrapingTickCanBeSkipped({ lastScrapingTickAt: undefined, now })).toBe(false);
  });

  test("skips while less than one scrape interval has elapsed", () => {
    expect(scrapingTickCanBeSkipped({ lastScrapingTickAt: now - 9_999, now })).toBe(true);
    expect(scrapingTickCanBeSkipped({ lastScrapingTickAt: now - 10_000, now })).toBe(false);
  });

  test("does not skip when the anchor is in the future", () => {
    expect(scrapingTickCanBeSkipped({ lastScrapingTickAt: now + 5_000, now })).toBe(true);
  });
});

describe("decideScrapingTick", () => {
  const now = 10_000_000;
  const RACK: RackSnapshot = {
    rackId: "rack-1",
    rackType: INFRASTRUCTURE_BUILD_ITEM_ID_VALUES[0],
    installedHardwareModuleIds: [HARDWARE_MODEL_ID_VALUES[0]],
    installedCoolerId: null,
  };
  const scrapingSlot = { [assignmentKey("rack-1", 0)]: { lane: "scraping" as const } };
  const decide = (args: {
    computeAssignments?: Record<string, { lane: "training" | "scraping" | "serving" }>;
    lastScrapingTickAt?: number;
    now?: number;
    tier?: "books" | "internet" | "synthetic";
  }) =>
    decideScrapingTick({
      racks: [RACK],
      computeAssignments: args.computeAssignments ?? {},
      activeScrapeTier: args.tier ?? "books",
      sourceTokensPerToken: 0.012,
      lastScrapingTickAt: args.lastScrapingTickAt,
      trainingPowerFp16Multiplier: 1,
      now: args.now ?? now,
    });

  test("resets the anchor when no card is on the scraping lane", () => {
    expect(decide({ lastScrapingTickAt: now - 86_400_000 })).toEqual({ kind: "reset_anchor" });
  });

  test("resets the anchor when a scraping card has no anchor yet", () => {
    expect(decide({ computeAssignments: scrapingSlot })).toEqual({ kind: "reset_anchor" });
  });

  test("an idle period cannot bank accrual once the lane is reassigned", () => {
    expect(
      decide({
        computeAssignments: { [assignmentKey("rack-1", 0)]: { lane: "training" } },
        lastScrapingTickAt: now - 86_400_000,
      }),
    ).toEqual({ kind: "reset_anchor" });
    expect(
      decide({ computeAssignments: scrapingSlot, lastScrapingTickAt: now, now: now + 9_999 }),
    ).toEqual({ kind: "skip" });
  });

  test("accrues once a full tier interval has elapsed under a scraping card", () => {
    const decision = decide({ computeAssignments: scrapingSlot, lastScrapingTickAt: now - 25_000 });
    expect(decision.kind).toBe("accrue");
    if (decision.kind !== "accrue") return;
    expect(decision.tokens).toBe(100);
    expect(decision.nextAnchorAt).toBe(now - 5_000);
  });

  test("a tier the scraping lane cannot power yields nothing", () => {
    expect(
      decide({ computeAssignments: scrapingSlot, lastScrapingTickAt: now - 25_000, tier: "internet" }),
    ).toEqual({ kind: "skip" });
  });
});
