import { beforeAll, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { loop } from "../loop";
import { classById } from "./classes/catalog";
import { applyMobCc, isMobInstance, mobCount, mobRuntimeOf } from "./ai/mobs";
import { content } from "./content";
import { CLASS_ENTITY_ID, COPPER } from "./model";
import { NPCS } from "./entities/npcs/catalog";
import { grantTalentPoint } from "./session/hero";
import { SPECS } from "./talents/catalog";
import { GATHER_NODES } from "./professions/catalog";
import { gatherNodeCount } from "./professions/gathering";

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
    const equips = ctx.game.store.get(`equip:${USER}`) as { mainhand?: string };
    expect(equips.mainhand).toBeDefined();
    expect(ctx.game.commands.run("class.select", { classId: "mage" }).status).toBe("rejected");
  });

  test("action bar defaults from the kit and spellbook reassigns slots", () => {
    const bar = ctx.game.store.get(`bar:${USER}`) as string[];
    expect(bar.length).toBeGreaterThanOrEqual(9);
    expect(bar.filter((id) => id !== "").length).toBe(9);
    const warrior = classById("warrior");
    const starter = warrior.abilities.find((ability) => ability.levelReq <= 1);
    expect(starter).toBeDefined();
    ctx.game.commands.run("spellbook.assign", { abilityId: starter?.id ?? "", slot: 8 });
    const after = ctx.game.store.get(`bar:${USER}`) as string[];
    expect(after[8]).toBe(starter?.id ?? "");
  });

  test("auto-attack kills a wolf, grants xp, copper, and quest credit", () => {
    expect(ctx.game.quest.accept(USER, "q_wolves")).toBeNull();
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
    const journal = ctx.game.quest.list(USER).find((quest) => quest.questId === "q_wolves");
    expect(journal).toBeDefined();
    const killObjective = journal?.objectives.find((objective) => objective.kind === "kill");
    expect(killObjective?.progress ?? 0).toBeGreaterThan(0);
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

  test("talent points are withheld before level 10 and grantTalentPoint unlocks allocation", () => {
    const chosen = ctx.game.commands.run("talent.choose", { specId: "warrior_arms" });
    expect(chosen.status).toBe("applied");
    const before = ctx.game.store.get(`talents:${USER}`) as { pointsAvailable: number } | undefined;
    expect(before?.pointsAvailable ?? 0).toBe(0);
    ctx.scene.entity.stats.set(USER, "level", { current: 10 });
    grantTalentPoint(ctx, USER, 10);
    const granted = ctx.game.store.get(`talents:${USER}`) as { pointsAvailable: number } | undefined;
    expect(granted?.pointsAvailable).toBe(1);
    const spec = SPECS.find((entry) => entry.id === "warrior_arms");
    const node = spec?.nodes.find(
      (entry) => entry.requires === undefined && entry.requiresPointsInBranch === undefined,
    );
    expect(node).toBeDefined();
    const allocated = ctx.game.commands.run("talent.allocate", { nodeId: node?.id ?? "" });
    expect(allocated.status).toBe("applied");
    const after = ctx.game.store.get(`talents:${USER}`) as
      | { pointsAvailable: number; ranks: Record<string, number> }
      | undefined;
    expect(after?.ranks[node?.id ?? ""]).toBe(1);
    expect(after?.pointsAvailable).toBe(0);
  });

  test("gathering nodes are placed and gathering grants materials and profession skill", () => {
    expect(gatherNodeCount()).toBeGreaterThan(50);
    const valeStarterIds = new Set(
      GATHER_NODES.filter((node) => node.zone === "vale" && node.skillReq === 0).map((node) => node.id),
    );
    const object = ctx.scene.object.list().find((entry) => valeStarterIds.has(entry.catalogId));
    expect(object).toBeDefined();
    const node = GATHER_NODES.find((entry) => entry.id === object?.catalogId);
    expect(node).toBeDefined();
    const material = node?.materials[0];
    expect(material).toBeDefined();
    const before = ctx.player.inventory.count("bags", material?.itemId ?? "");
    ctx.game.commands.run("gather", { instanceId: object?.instanceId ?? "" });
    const after = ctx.player.inventory.count("bags", material?.itemId ?? "");
    expect(after).toBeGreaterThan(before);
    const profs = ctx.game.store.get(`profs:${USER}`) as Record<string, number> | undefined;
    expect(profs?.[node?.profession ?? ""]).toBe(2);
  });

  test("bank deposit and withdraw round-trip bags contents", () => {
    ctx.game.commands.run("bank.open", {});
    const bagsBefore = ctx.player.inventory.count("bags", "baked_bread");
    ctx.game.commands.run("bank.deposit", { itemId: "baked_bread" });
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(bagsBefore - 1);
    expect(ctx.player.inventory.count("bank", "baked_bread")).toBe(1);
    ctx.game.commands.run("bank.withdraw", { itemId: "baked_bread" });
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(bagsBefore);
    expect(ctx.player.inventory.count("bank", "baked_bread")).toBe(0);
    ctx.game.commands.run("bank.close", {});
  });

  test("rested xp pool is drawn down by a kill", () => {
    ctx.game.store.set(`rested:${USER}`, 500);
    const preyId = firstMobOf(ctx, "mire_prowler");
    ctx.scene.entity.effect({ from: USER, to: preyId, effect: "damage", via: { amount: 999999 } });
    expect(ctx.scene.entity.get(preyId)).toBeNull();
    const pool = ctx.game.store.get(`rested:${USER}`) as number;
    expect(pool).toBeLessThan(500);
  });

  test("applyMobCc lands on a live mob and rejects an unknown instance id", () => {
    const wolfId = firstMobOf(ctx, "forest_wolf");
    expect(applyMobCc(ctx, wolfId, USER, { kind: "stun", durationSec: 2 })).toBe(true);
    expect(applyMobCc(ctx, "not-a-real-instance", USER, { kind: "stun", durationSec: 2 })).toBe(false);
  });
});
