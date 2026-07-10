import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { content } from "../content";
import type { CityMetrics } from "../catalog";
import { briefCompleted, CITY_EVENTS, growthBriefs, nextCharterEvent, objectiveDone, objectiveProgress } from "./briefs";
import { activeCharter, activeEventId, advanceGrowth, ageBuildingsDaily, briefStage, cityBuildings, cityDecisions, resolveCharter, undoCity } from "./state";
import { onInit } from "../../loop";

const metrics = (overrides: Partial<CityMetrics>): CityMetrics => ({
  population: 0,
  capacity: 0,
  jobs: 0,
  culture: 0,
  civic: 0,
  activity: 0,
  approval: 0,
  carbon: 0,
  ...overrides,
});

function makeContext() {
  const ctx = createGameContext({
    definition: defineGame({ name: "Monument", assets: createAssetCatalog(), multiplayer: "off" }),
    content,
    player: { userId: "architect", isNew: true },
  });
  onInit(ctx);
  return ctx;
}

describe("growth briefs", () => {
  test("three sketches with four objectives each", () => {
    const briefs = growthBriefs(metrics({}), 0, 0);
    expect(briefs.length).toBe(3);
    for (const brief of briefs) expect(brief.objectives.length).toBe(4);
  });

  test("sketch one completes on the documented thresholds", () => {
    const briefs = growthBriefs(metrics({ population: 2500, jobs: 1200, approval: 72 }), 10, 4);
    expect(briefCompleted(briefs[0])).toBe(true);
    const shy = growthBriefs(metrics({ population: 2499, jobs: 1200, approval: 72 }), 10, 4);
    expect(briefCompleted(shy[0])).toBe(false);
  });

  test("carbon objective inverts direction and formats as a ceiling", () => {
    const briefs = growthBriefs(metrics({ population: 4000, carbon: 20000, civic: 500 }), 10, 6);
    const carbonObjective = briefs[1].objectives[3];
    expect(objectiveDone(carbonObjective)).toBe(true);
    expect(objectiveProgress(carbonObjective)).toBe("5.0t / ≤ 6.0t");
    const dirty = growthBriefs(metrics({ population: 1000, carbon: 20000, civic: 500 }), 10, 6);
    expect(objectiveDone(dirty[1].objectives[3])).toBe(false);
  });

  test("events unlock in sketch order and skip decided ones", () => {
    expect(nextCharterEvent(0, {})).toBeNull();
    expect(nextCharterEvent(1, {})?.id).toBe("undercroft");
    expect(nextCharterEvent(1, { undercroft: "open" })).toBeNull();
    expect(nextCharterEvent(3, { undercroft: "open" })?.id).toBe("commons");
    expect(nextCharterEvent(3, { undercroft: "open", commons: "shared", aggregate: "reuse" })).toBeNull();
  });
});

describe("charter flow", () => {
  test("resolving a charter event records the decision and bends the city", () => {
    const ctx = makeContext();
    ctx.game.store.set("briefStage", 1);
    advanceGrowth(ctx);
    expect(activeEventId(ctx)).toBe("undercroft");
    expect(ctx.time.snapshot().paused).toBe(true);
    ctx.game.commands.run("charter.resolve", { eventId: "undercroft", choice: 0 });
    expect(activeCharter(ctx).undercroft).toBe("open");
    expect(cityDecisions(ctx).length).toBe(1);
    expect(activeEventId(ctx)).toBeNull();
    expect(ctx.time.snapshot().paused).toBe(false);
  });

  test("undo reverts a charter decision", () => {
    const ctx = makeContext();
    ctx.game.store.set("briefStage", 1);
    advanceGrowth(ctx);
    resolveCharter(ctx, "undercroft", 1);
    expect(activeCharter(ctx).undercroft).toBe("quiet");
    undoCity(ctx);
    expect(activeCharter(ctx).undercroft).toBeUndefined();
    expect(cityDecisions(ctx).length).toBe(0);
  });

  test("stage advance fires a toast-worthy transition exactly once per sketch", () => {
    const ctx = makeContext();
    expect(briefStage(ctx)).toBe(0);
    advanceGrowth(ctx);
    expect(briefStage(ctx)).toBe(0);
  });
});

describe("daily aging", () => {
  test("age climbs and condition floors, slower under a formal charter", () => {
    const ctx = makeContext();
    const before = cityBuildings(ctx)[0];
    ageBuildingsDaily(ctx, 2);
    const after = cityBuildings(ctx)[0];
    expect(after.age).toBeCloseTo(before.age + 0.16, 5);
    expect(after.condition).toBeCloseTo(Math.max(72, before.condition - 0.06), 5);

    ctx.game.store.set("charter", { aggregate: "formal" });
    const formalBefore = cityBuildings(ctx)[0];
    ageBuildingsDaily(ctx, 1);
    expect(cityBuildings(ctx)[0].condition).toBeCloseTo(Math.max(72, formalBefore.condition - 0.012), 5);
  });

  test("condition never drops below the floor", () => {
    const ctx = makeContext();
    ageBuildingsDaily(ctx, 10000);
    for (const b of cityBuildings(ctx)) expect(b.condition).toBe(72);
  });
});

describe("event copy", () => {
  test("all three events carry two choices with impacts", () => {
    expect(CITY_EVENTS.length).toBe(3);
    for (const event of CITY_EVENTS) {
      expect(event.choices.length).toBe(2);
      for (const choice of event.choices) expect(choice.impacts.length).toBeGreaterThan(0);
    }
  });
});
