import { describe, expect, test } from "bun:test";

import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { world } from "../world";
import { game } from "../game.config";
import { content } from "./content";
import { onInit } from "../loop";
import { DECOR, FURNITURE } from "./objects/catalog";
import { householdStore } from "./session/store";

function boot(): GameContext {
  const ctx = createGameContext({
    definition: game.game,
    content,
    player: { userId: "director", isNew: true },
  });
  onInit(ctx);
  return ctx;
}

describe("starhome world", () => {
  test("environment world resolves a terrain backdrop", () => {
    if (world.kind !== "environment") throw new Error("expected environment world");
    const summary = summarizeEnvironment(world);
    expect(summary.isEmpty).toBe(false);
    expect(summary.terrain).toBeDefined();
  });

  test("setup seeds the household and furnishes the habitat", () => {
    const ctx = boot();
    const household = householdStore.read(ctx);
    expect(household.order.length).toBe(4);
    for (const id of household.order) {
      expect(ctx.scene.entity.get(id)).not.toBeNull();
      expect(household.members[id]?.name.length ?? 0).toBeGreaterThan(1);
    }
    const objects = ctx.scene.object.list();
    const catalogIds = new Set(objects.map((o) => o.catalogId));
    for (const def of FURNITURE) expect(catalogIds.has(def.id)).toBe(true);
    expect(objects.filter((o) => DECOR.some((d) => d.id === o.catalogId)).length).toBeGreaterThan(4);
  });

  test("body plans are varied across the household", () => {
    const ctx = boot();
    const household = householdStore.read(ctx);
    const shapes = new Set(household.order.map((id) => household.members[id]?.bodyPlan.shape));
    expect(shapes.size).toBeGreaterThan(1);
  });
});
