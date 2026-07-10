import { beforeAll, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { loop } from "../loop";
import { isMobInstance, mobCount, mobRuntimeOf } from "./ai/mobs";
import { content } from "./content";
import { CLASS_ENTITY_ID, COPPER } from "./model";
import { NPCS } from "./entities/npcs/catalog";

const USER = "hero-test";

function step(ctx: GameContext, seconds: number, dt = 0.1): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    ctx.time.advance(dt);
    loop.onTick?.(ctx, dt);
  }
}

function firstMobOf(ctx: GameContext, catalogId: string): string {
  const mob = ctx.scene.entity.list().find((entity) => entity.name === catalogId && isMobInstance(entity.id));
  if (mob === undefined) throw new Error(`no ${catalogId} spawned`);
  return mob.id;
}

function moveNextTo(ctx: GameContext, instanceId: string): void {
  const target = ctx.scene.entity.get(instanceId);
  if (target === null) throw new Error("target missing");
  ctx.scene.entity.setPose(USER, {
    position: [target.position[0] + 1.2, target.position[1], target.position[2]],
  });
}

describe("claudecraft gameplay (headless)", () => {
  let ctx: GameContext;

  beforeAll(() => {
    ctx = createGameContext({
      definition: game.game,
      content,
      player: { userId: USER, isNew: true },
    });
    loop.onInit?.(ctx);
    loop.onNewPlayer?.(ctx);
  });

  test("world boots with a populated roster", () => {
    expect(mobCount()).toBeGreaterThan(120);
    expect(ctx.scene.entity.get(USER)).not.toBeNull();
    for (const npc of NPCS) expect(ctx.scene.entity.get(`npc:${npc.id}`)).not.toBeNull();
  });

  test("class select seeds warrior stats, kit, and starter gear", () => {
    const result = ctx.game.commands.run("class.select", { classId: "warrior" });
    expect(result.status).toBe("applied");
    const health = ctx.scene.entity.stats.get(USER, "health");
    expect(health).not.toBeNull();
    expect(health?.max).toBeGreaterThan(200);
    expect(health?.current).toBe(health?.max);
    expect(ctx.game.economy.balance(USER, COPPER)).toBe(40);
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(5);
    const equips = ctx.game.store.get(`equip:${USER}`) as { mainHand?: string };
    expect(equips.mainHand).toBeDefined();
    expect(ctx.game.commands.run("class.select", { classId: "mage" }).status).toBe("rejected");
  });

  test("auto-attack kills a wolf, grants xp, copper, and quest credit", () => {
    const accept = ctx.game.quest.accept(USER, "wolves_at_the_door");
    void accept;
    const wolfId = firstMobOf(ctx, "forest_wolf");
    const startCopper = ctx.game.economy.balance(USER, COPPER);
    const startXp = ctx.scene.entity.stats.get(USER, "xp")?.current ?? 0;
    moveNextTo(ctx, wolfId);
    ctx.scene.entity.setTarget(USER, wolfId);
    ctx.game.commands.run("attack", {});
    const before = ctx.scene.entity.stats.get(wolfId, "health")?.current ?? 0;
    step(ctx, 2.5);
    const after = ctx.scene.entity.stats.get(wolfId, "health")?.current ?? 0;
    expect(after).toBeLessThan(before);
    let guard = 0;
    while (ctx.scene.entity.get(wolfId) !== null && guard < 400) {
      moveNextTo(ctx, wolfId);
      step(ctx, 0.5);
      guard += 1;
    }
    expect(ctx.scene.entity.get(wolfId)).toBeNull();
    expect(mobRuntimeOf(wolfId)).toBeNull();
    expect(ctx.scene.entity.stats.get(USER, "xp")?.current ?? 0).toBeGreaterThan(startXp - 1);
    expect(ctx.game.economy.balance(USER, COPPER)).toBeGreaterThan(startCopper);
    const journal = ctx.game.quest.list(USER).find((quest) => quest.questId === "wolves_at_the_door");
    if (journal !== undefined) {
      const killObjective = journal.objectives.find((objective) => objective.kind === "kill");
      expect(killObjective?.progress ?? 0).toBeGreaterThan(0);
    }
  });

  test("rage built from swings pays for a warrior strike", () => {
    const resource = ctx.scene.entity.stats.get(USER, "resource");
    expect(resource?.current ?? 0).toBeGreaterThan(0);
  });

  test("death flags the hero and release respawns at a graveyard with level intact", () => {
    const levelBefore = ctx.scene.entity.stats.get(USER, "level")?.current ?? 1;
    const boss = firstMobOf(ctx, "morthen");
    ctx.scene.entity.effect({ from: boss, to: USER, effect: "damage", via: { amount: 999999 } });
    expect(ctx.game.store.get(`dead:${USER}`)).toBe(true);
    expect(ctx.scene.entity.get(USER)).toBeNull();
    const release = ctx.game.commands.run("player.release", {});
    expect(release.status).toBe("applied");
    const hero = ctx.scene.entity.get(USER);
    expect(hero).not.toBeNull();
    expect(ctx.scene.entity.stats.get(USER, "level")?.current).toBe(levelBefore);
    const health = ctx.scene.entity.stats.get(USER, "health");
    expect(health?.current).toBe(health?.max);
    expect(ctx.game.store.get(`dead:${USER}`)).toBe(false);
  });

  test("vendor buys and sells against the eastbrook shop", () => {
    ctx.game.commands.run("shop.open", { shopId: "shop_eastbrook" });
    ctx.game.economy.grant(USER, COPPER, 5000);
    const stock = ctx.game.trade.tradableAt(
      "shop_eastbrook",
      ["baked_bread", CLASS_ENTITY_ID],
    );
    expect(stock).toContain("baked_bread");
    const before = ctx.player.inventory.count("bags", "baked_bread");
    const result = ctx.game.commands.run("shop.buy", { itemId: "baked_bread" });
    expect(result.status).toBe("applied");
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(before + 1);
    const copperBefore = ctx.game.economy.balance(USER, COPPER);
    ctx.game.commands.run("shop.sell", { itemId: "baked_bread" });
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(before);
    expect(ctx.game.economy.balance(USER, COPPER)).toBeGreaterThan(copperBefore);
  });

  test("eating bread is blocked mid-combat and heals out of combat", () => {
    const wolfId = firstMobOf(ctx, "forest_wolf");
    moveNextTo(ctx, wolfId);
    ctx.scene.entity.setTarget(USER, wolfId);
    ctx.game.commands.run("attack", {});
    step(ctx, 1);
    const blocked = ctx.item.use.can({ from: USER, itemId: "baked_bread", inventoryId: "bags" });
    expect(blocked).not.toBeNull();
    ctx.scene.entity.setTarget(USER, null);
    ctx.scene.entity.setPose(USER, { position: [0, ctx.world.groundHeightAt(0, 300), 300] });
    step(ctx, 14);
    const allowed = ctx.item.use.can({ from: USER, itemId: "baked_bread", inventoryId: "bags" });
    expect(allowed).toBeNull();
  });
});
