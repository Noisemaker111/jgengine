import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { readDamageTable } from "@jgengine/core/combat/damage/damageTable";
import { UnknownTargetProfileError } from "@jgengine/core/combat/damage/damageRuntime";

import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { DAMAGE_TABLE, harborDamage, landBlast, landHit, profileFor } from "./hitModel";

const HERO = "damage-hero";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: HERO, isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  return ctx;
}

function healthOf(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "health")?.current ?? 0;
}

describe("High Tide Pizza's damage chart: bumpers, rams and blasts, no weapons", () => {
  test("the chart reads, and every kind it names is neutral against people and vehicles", () => {
    expect(() => readDamageTable(DAMAGE_TABLE)).not.toThrow();
    expect(DAMAGE_TABLE.types.map((type) => type.id)).toEqual(["blast", "impact"]);
    for (const type of DAMAGE_TABLE.types) expect(type.vs).toEqual({ flesh: 1, chassis: 1 });
  });

  test("people are flesh, vehicles are chassis, scenery takes nothing, and an unknown target is refused", () => {
    const ctx = boot();
    expect(() => harborDamage(ctx).hit({ target: "nobody", type: "impact", base: 14 })).toThrow(UnknownTargetProfileError);
    expect(profileFor("street_runner")).toEqual({ resistance: "flesh", armor: 0 });
    expect(profileFor("ped_city")).toEqual({ resistance: "flesh", armor: 0 });
    expect(profileFor("cop_patrol")).toEqual({ resistance: "flesh", armor: 0 });
    expect(profileFor("car_compact")).toEqual({ resistance: "chassis", armor: 0 });
    expect(profileFor("obj_delivery_1")).toBeNull();
  });

  test("a bumper on a pedestrian drains their health through the engine's effect system", () => {
    const ctx = boot();
    ctx.scene.entity.spawn("ped_city", { id: "ped_target", position: [0, 0, 0], role: "npc" });
    expect(healthOf(ctx, "ped_target")).toBe(20);
    expect(landHit(ctx, { from: HERO, to: "ped_target", type: "impact", base: 12 })?.damage).toBe(12);
    expect(healthOf(ctx, "ped_target")).toBe(8);
  });

  test("a warden's ram on the rider drains the crash jacket before health", () => {
    const ctx = boot();
    ctx.scene.entity.stats.set(HERO, "armor", { current: 100 });
    expect(landHit(ctx, { from: "cruiser_x", to: HERO, type: "impact", base: 6 })?.damage).toBe(6);
    expect(ctx.scene.entity.stats.get(HERO, "armor")?.current).toBe(94);
    expect(ctx.scene.entity.stats.get(HERO, "health")?.current).toBe(100);
  });

  test("an exploding engine resolves each body in the radius on the shared falloff", () => {
    const ctx = boot();
    const ground = ctx.world.groundHeightAt(0, 0);
    ctx.scene.entity.spawn("ped_city", { id: "blast_near", position: [1, ground, 0], role: "npc" });
    ctx.scene.entity.spawn("ped_city", { id: "blast_far", position: [5, ground, 0], role: "npc" });
    const landed = landBlast(ctx, { from: "car_x", at: [0, ground, 0], radius: 6, type: "blast", base: 18 });
    const near = landed.find((row) => row.target === "blast_near")!;
    const far = landed.find((row) => row.target === "blast_far")!;
    expect(near.damage).toBeCloseTo(18 * (1 - 1 / 6), 6);
    expect(far.damage).toBeCloseTo(18 * (1 - 5 / 6), 6);
    expect(healthOf(ctx, "blast_far")).toBeCloseTo(20 - far.damage, 6);
  });
});
