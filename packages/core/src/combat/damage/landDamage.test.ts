import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createDamageRuntime, UnknownTargetProfileError } from "./damageRuntime";
import { landAreaDamage, landDamage } from "./landDamage";

function world(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Land damage", assets: createAssetCatalog(), multiplayer: "off" }),
    content: {
      itemById: () => undefined,
      entityById: () => ({ stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } } }),
    },
    player: { userId: "hero", isNew: true },
  });
  ctx.scene.entity.spawn("mob", { id: "near", position: [1, 0, 0] });
  ctx.scene.entity.spawn("mob", { id: "far", position: [3, 0, 0] });
  ctx.scene.entity.spawn("mob", { id: "out", position: [9, 0, 0] });
  return ctx;
}

const health = (ctx: GameContext, id: string) => ctx.scene.entity.stats.get(id, "health")?.current;

function chart() {
  return createDamageRuntime({
    table: { types: [{ id: "fire", vs: { flesh: 1.25 } }], defaultMultiplier: 1 },
    zones: { zones: [{ id: "body", multiplier: 1 }], defaultZone: "body", critChance: 0 },
    rng: () => 0.5,
  });
}

describe("landDamage", () => {
  test("resolves through the chart and lands the result as one damage effect", () => {
    const ctx = world();
    const runtime = chart();
    runtime.registerTarget("near", { resistance: "flesh" });
    const landed = landDamage(ctx, runtime, { source: "hero", target: "near", type: "fire", base: 9, round: true });
    expect(landed.resolution.damage).toBeCloseTo(11.25);
    expect(landed.amount).toBe(11);
    expect(health(ctx, "near")).toBe(89);
  });

  test("an unprofiled target throws instead of dealing its base number", () => {
    const ctx = world();
    expect(() => landDamage(ctx, chart(), { source: "hero", target: "near", type: "fire", base: 9 })).toThrow(UnknownTargetProfileError);
    expect(health(ctx, "near")).toBe(100);
  });

  test("an area payload shares out by linear falloff and skips bodies prepare refuses", () => {
    const ctx = world();
    const runtime = chart();
    const landed = landAreaDamage(ctx, runtime, { source: "hero", at: [0, 0, 0], radius: 4, type: "fire", base: 40 }, (id) => {
      if (id === "far") return false;
      runtime.registerTarget(id, { resistance: "flesh" });
      return true;
    });
    expect(landed.map((hit) => hit.resolution.target)).toEqual(["near"]);
    expect(health(ctx, "near")).toBe(100 - 40 * 0.75 * 1.25);
    expect(health(ctx, "far")).toBe(100);
    expect(health(ctx, "out")).toBe(100);
  });
});
