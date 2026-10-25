import { expect, test } from "bun:test";
import type { EntityDiedEvent } from "../game/events";
import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext, type GameContextContent } from "./gameContext";

/** A player whose game owns its death (a downed window): `onDeath.keep` leaves it in the scene. */
function fixture(keep: boolean) {
  const content: GameContextContent = {
    entityById: (id) =>
      id === "hero"
        ? {
            stats: { shield: { max: 20, min: 0 }, health: { max: 50, min: 1 }, level: { max: 30, min: 1, current: 7 } },
            receive: { damage: { order: ["shield", "health"] } },
            onDeath: { keep },
          }
        : { stats: { health: { max: 10 } } },
  };
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "kept death", assets: createAssetCatalog(), multiplayer: "off" }),
    content,
    player: { userId: "me", isNew: true },
  });
  ctx.scene.entity.spawn("hero", { id: "me", position: [0, 0, 0], role: "player" });
  ctx.scene.entity.spawn("raider", { id: "raider", position: [2, 0, 0] });
  const died: EntityDiedEvent[] = [];
  ctx.game.events.on("entity.died", (event) => died.push(event));
  const hit = (amount: number) => ctx.scene.entity.effect({ from: "raider", to: "me", effect: "damage", via: { amount } });
  return { ctx, died, hit };
}

test("a kept entity survives its lethal hit with its stats and a kept death event", () => {
  const { ctx, died, hit } = fixture(true);
  const [result] = hit(500);
  expect(result?.lethal).toBe(true);
  expect(ctx.scene.entity.get("me")).not.toBeNull();
  expect(ctx.scene.entity.stats.get("me", "health")?.current).toBe(1);
  expect(ctx.scene.entity.stats.get("me", "level")?.current).toBe(7);
  expect(died).toHaveLength(1);
  expect(died[0]?.kept).toBe(true);
  expect(died[0]?.instanceId).toBe("me");
});

test("a graze on a kept entity whose shield regrew is not a second death; a heal re-arms it", () => {
  const { ctx, died, hit } = fixture(true);
  hit(500);
  ctx.scene.entity.stats.set("me", "shield", { current: 10 });
  const [graze] = hit(30);
  expect(graze?.lethal).toBe(false);
  expect(died).toHaveLength(1);
  ctx.scene.entity.stats.set("me", "health", { current: 40 });
  const [again] = hit(500);
  expect(again?.lethal).toBe(true);
  expect(died).toHaveLength(2);
  expect(ctx.scene.entity.get("me")).not.toBeNull();
});

test("without keep the lethal hit still removes the entity", () => {
  const { ctx, died, hit } = fixture(false);
  hit(500);
  expect(ctx.scene.entity.get("me")).toBeNull();
  expect(died[0]?.kept).toBeUndefined();
});

test("presentation can tell a kept death from one that removed the body", async () => {
  const { deathRemovesEntity } = await import("../combat/death");
  expect(deathRemovesEntity({ kept: true })).toBe(false);
  expect(deathRemovesEntity({})).toBe(true);
});
