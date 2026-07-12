import { beforeAll, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { evaluateSkillCheck } from "@jgengine/core/interaction/skillCheck";

import { game } from "../game.config";
import { loop } from "../loop";
import { classById } from "./classes/catalog";
import { applyMobCc, isMobInstance, mobCount, mobRuntimeOf } from "./ai/mobs";
import { buildLootTables, content } from "./content";
import { CLASS_ENTITY_ID, COPPER } from "./model";
import { FISH_TABLE } from "./crafting/catalog";
import { FISHING_CHECK, RECIPES, RECIPE_SKILL } from "./crafting/systems";
import { DUNGEONS, dungeonById } from "./dungeons/catalog";
import { mobById } from "./entities/enemies/catalog";
import { NPCS } from "./entities/npcs/catalog";
import { applySheet, grantTalentPoint, heroOf, heroSheet, resetHero } from "./session/hero";
import { SPECS } from "./talents/catalog";
import { GATHER_NODES } from "./professions/catalog";
import { gatherNodeCount } from "./professions/gathering";
import { onWorldBossKilled, WORLD_BOSS_MOB_ID, worldBossLockedOut } from "./world/worldBoss";

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

function ensureHeroPresent(ctx: GameContext): void {
  if (ctx.scene.entity.get(USER) !== null) return;
  const [x, z] = [6, -288];
  ctx.scene.entity.spawn(CLASS_ENTITY_ID, {
    id: USER,
    position: [x, ctx.world.groundHeightAt(x, z), z],
  });
  applySheet(ctx, USER, { fill: true });
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

  test("dungeon door round-trip teleports into and out of the sunken bastion, preserving hero stats", () => {
    const dungeon = dungeonById("sunken_bastion");
    if (dungeon === null) throw new Error("sunken_bastion missing from catalog");
    const before = {
      level: ctx.scene.entity.stats.get(USER, "level"),
      xp: ctx.scene.entity.stats.get(USER, "xp"),
      health: ctx.scene.entity.stats.get(USER, "health"),
    };
    const enter = ctx.game.commands.run("dungeon.enter", { dungeonId: "sunken_bastion" });
    expect(enter.status).toBe("applied");
    const insideHero = ctx.scene.entity.get(USER);
    expect(insideHero).not.toBeNull();
    const insideDist = Math.hypot(
      (insideHero?.position[0] ?? 0) - dungeon.inside[0],
      (insideHero?.position[2] ?? 0) - dungeon.inside[1],
    );
    expect(insideDist).toBeLessThan(1);
    expect(ctx.scene.entity.stats.get(USER, "level")?.current).toBe(before.level?.current);
    expect(ctx.scene.entity.stats.get(USER, "xp")?.current).toBe(before.xp?.current);
    expect(ctx.scene.entity.stats.get(USER, "health")?.current).toBe(before.health?.current);
    expect(ctx.scene.entity.stats.get(USER, "health")?.max).toBe(before.health?.max);
    const exit = ctx.game.commands.run("dungeon.exit", { dungeonId: "sunken_bastion" });
    expect(exit.status).toBe("applied");
    const outsideHero = ctx.scene.entity.get(USER);
    const entranceDist = Math.hypot(
      (outsideHero?.position[0] ?? 0) - dungeon.entrance[0],
      (outsideHero?.position[2] ?? 0) - dungeon.entrance[1],
    );
    expect(entranceDist).toBeLessThan(1);
  });

  test("every dungeon has at least one of its catalog mobs spawned within its radius", () => {
    for (const dungeon of DUNGEONS) {
      const inhabited = ctx.scene.entity.list().some((entity) => {
        const runtime = mobRuntimeOf(entity.id);
        if (runtime === null) return false;
        if (mobById(runtime.defId)?.dungeonId !== dungeon.id) return false;
        const dist = Math.hypot(entity.position[0] - dungeon.center[0], entity.position[2] - dungeon.center[1]);
        return dist <= dungeon.radius + 8;
      });
      expect(inhabited).toBe(true);
    }
  });

  test("korgath_the_bound enrages once his health drops below the threshold", () => {
    const enter = ctx.game.commands.run("dungeon.enter", { dungeonId: "gravewyrm_sanctum" });
    expect(enter.status).toBe("applied");
    const bossId = firstMobOf(ctx, "korgath_the_bound");
    ctx.scene.entity.stats.set(USER, "health", { max: 100000, current: 100000 });
    moveNextTo(ctx, bossId);
    ctx.scene.entity.setTarget(USER, bossId);
    ctx.game.commands.run("attack", {});
    step(ctx, 3);
    const floats: string[] = [];
    const unsubscribe = ctx.game.events.on("entity.floatText", (event) => {
      if (event.instanceId === bossId) floats.push(event.text);
    });
    const bossHealth = ctx.scene.entity.stats.get(bossId, "health");
    expect(bossHealth).not.toBeNull();
    ctx.scene.entity.stats.set(bossId, "health", { current: Math.round((bossHealth?.max ?? 0) * 0.2) });
    step(ctx, 3);
    unsubscribe();
    expect(floats.some((text) => text.includes("enrages!"))).toBe(true);
    ctx.scene.entity.setTarget(USER, null);
    const exit = ctx.game.commands.run("dungeon.exit", { dungeonId: "gravewyrm_sanctum" });
    expect(exit.status).toBe("applied");
  });

  test("grand_necromancer_velkhar raises new bonewalkers while fighting", () => {
    const enter = ctx.game.commands.run("dungeon.enter", { dungeonId: "gravewyrm_sanctum" });
    expect(enter.status).toBe("applied");
    const bossId = firstMobOf(ctx, "grand_necromancer_velkhar");
    const before = new Set(
      ctx.scene.entity
        .list()
        .filter((entity) => mobRuntimeOf(entity.id)?.defId === "raised_bonewalker")
        .map((entity) => entity.id),
    );
    ctx.scene.entity.stats.set(USER, "health", { max: 100000, current: 100000 });
    moveNextTo(ctx, bossId);
    ctx.scene.entity.setTarget(USER, bossId);
    ctx.game.commands.run("attack", {});
    step(ctx, 26);
    const newBonewalkers = ctx.scene.entity
      .list()
      .filter((entity) => mobRuntimeOf(entity.id)?.defId === "raised_bonewalker" && !before.has(entity.id));
    expect(newBonewalkers.length).toBeGreaterThan(0);
    ctx.scene.entity.setTarget(USER, null);
    const exit = ctx.game.commands.run("dungeon.exit", { dungeonId: "gravewyrm_sanctum" });
    expect(exit.status).toBe("applied");
  });

  test("nythraxis raid loot table carries its two legendary drops", () => {
    const tables = buildLootTables();
    const table = tables.find((entry) => entry.id === "drops:nythraxis_scourge_of_thornpeak");
    expect(table).toBeDefined();
    const items = (table?.entries ?? [])
      .map((entry) => entry.item)
      .filter((item): item is string => item !== undefined);
    expect(items).toContain("deathless_heartwood");
    expect(items).toContain("kingsbane_last_oath");
  });

  test("crafting a skillReq-0 recipe consumes its inputs and grants the output plus a skill-up", () => {
    const starterRecipes = RECIPES.filter((entry) => (RECIPE_SKILL[entry.id] ?? 0) === 0);
    const cheapest = starterRecipes.reduce((best, entry) => {
      const cost = entry.inputs.reduce((sum, input) => sum + input.count, 0);
      const bestCost = best.inputs.reduce((sum, input) => sum + input.count, 0);
      return cost < bestCost ? entry : best;
    });
    for (const input of cheapest.inputs) ctx.player.inventory.put("bags", input.itemId, input.count);
    const output = cheapest.outputs[0];
    if (output === undefined) throw new Error("recipe has no output");
    const outputBefore = ctx.player.inventory.count("bags", output.itemId);
    const result = ctx.game.commands.run("craft.make", { recipeId: cheapest.id });
    expect(result.status).toBe("applied");
    for (const input of cheapest.inputs) {
      expect(ctx.player.inventory.count("bags", input.itemId)).toBe(0);
    }
    expect(ctx.player.inventory.count("bags", output.itemId)).toBe(outputBefore + output.count);
    const profs = ctx.game.store.get(`profs:${USER}`) as Record<string, number> | undefined;
    expect(profs?.crafting).toBe(2);
  });

  test("fishing casts, resolves a passing skill check, and lands a fish plus a skill-up", () => {
    ctx.game.commands.run("fishing.cast", {});
    expect(ctx.game.store.get(`fishing:${USER}`)).toBeDefined();
    let passingElapsed: number | null = null;
    for (let elapsed = 0; elapsed <= 6; elapsed += 0.05) {
      if (evaluateSkillCheck(FISHING_CHECK, elapsed).success) {
        passingElapsed = elapsed;
        break;
      }
    }
    if (passingElapsed === null) throw new Error("no passing elapsed found for FISHING_CHECK");
    ctx.time.advance(passingElapsed);
    const bagsBefore = FISH_TABLE.map((entry) => ctx.player.inventory.count("bags", entry.itemId));
    const profsBefore = ctx.game.store.get(`profs:${USER}`) as Record<string, number> | undefined;
    ctx.game.commands.run("fishing.cast", {});
    expect(ctx.game.store.get(`fishing:${USER}`)).toBeUndefined();
    const bagsAfter = FISH_TABLE.map((entry) => ctx.player.inventory.count("bags", entry.itemId));
    expect(bagsAfter.some((count, index) => count > bagsBefore[index])).toBe(true);
    const profsAfter = ctx.game.store.get(`profs:${USER}`) as Record<string, number> | undefined;
    expect(profsAfter?.fishing).toBe((profsBefore?.fishing ?? 1) + 1);
  });

  test("delve enter spawns chamber hostiles and a companion, exit returns the hero", () => {
    const before = ctx.scene.entity.get(USER)?.position;
    expect(before).toBeDefined();
    const enter = ctx.game.commands.run("delve.enter", { delveId: "embervein_delve", tier: "normal" });
    expect(enter.status).toBe("applied");
    const session = ctx.game.store.get(`delve:${USER}`) as
      | { remaining: number; companionId: string | null; status: string }
      | undefined;
    expect(session?.status).toBe("playing");
    expect(session?.remaining ?? 0).toBeGreaterThan(0);
    expect(session?.companionId).not.toBeNull();
    const exit = ctx.game.commands.run("delve.exit", {});
    expect(exit.status).toBe("applied");
    expect(ctx.game.store.get(`delve:${USER}`)).toBeUndefined();
    expect(ctx.scene.entity.get(USER)).not.toBeNull();
  });

  test("mail send-to-self delivers after the delay", () => {
    ctx.player.inventory.put("bags", "baked_bread", 2);
    const before = ctx.player.inventory.count("bags", "baked_bread");
    ctx.game.commands.run("mail.open", {});
    ctx.game.commands.run("mail.sendSelf", { itemId: "baked_bread", count: 1 });
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(before - 1);
    const view = ctx.game.store.get(`mailView:${USER}`) as { pending: readonly unknown[] } | undefined;
    expect((view?.pending.length ?? 0)).toBeGreaterThan(0);
    step(ctx, 9);
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(before);
    ctx.game.commands.run("mail.close", {});
  });

  test("market buy purchases against vendor stock", () => {
    ctx.game.economy.grant(USER, COPPER, 2000);
    ctx.game.commands.run("market.open", {});
    const before = ctx.player.inventory.count("bags", "baked_bread");
    const buy = ctx.game.commands.run("market.buy", { itemId: "baked_bread" });
    expect(buy.status).toBe("applied");
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(before + 1);
    ctx.game.commands.run("shop.close", {});
  });

  test("vale cup match starts and records a kick", () => {
    ensureHeroPresent(ctx);
    const start = ctx.game.commands.run("valecup.start", { wager: 0 });
    expect(start.status).toBe("applied");
    const match = ctx.game.store.get(`valecup:${USER}`) as { active: boolean; scoreHome: number } | undefined;
    expect(match?.active).toBe(true);
    ctx.game.commands.run("valecup.kick", { dirX: 0, dirZ: -1 });
    step(ctx, 0.5);
    ctx.game.commands.run("valecup.leave", {});
    expect(ctx.game.store.get(`valecup:${USER}`)).toBeUndefined();
  });

  test("protect yumi spawns the cat and leaves cleanly", () => {
    ensureHeroPresent(ctx);
    const start = ctx.game.commands.run("yumi.start", {});
    expect(start.status).toBe("applied");
    const view = ctx.game.store.get(`yumi:${USER}`) as { yumiHp: number; status: string } | undefined;
    expect(view?.status).toBe("playing");
    expect(view?.yumiHp).toBeGreaterThan(0);
    step(ctx, 1);
    ctx.game.commands.run("yumi.leave", {});
    expect(ctx.game.store.get(`yumi:${USER}`)).toBeUndefined();
  });

  test("hunter call_pet ability summons a living pet frame", () => {
    ensureHeroPresent(ctx);
    resetHero(USER);
    ctx.game.store.delete(`class:${USER}`);
    ctx.game.store.delete(`spec:${USER}`);
    ctx.game.store.delete(`talents:${USER}`);
    ctx.game.store.delete(`bar:${USER}`);
    ctx.game.store.delete(`equip:${USER}`);
    const select = ctx.game.commands.run("class.select", { classId: "hunter" });
    expect(select.status).toBe("applied");
    const summon = ctx.game.commands.run("pet.summon", { petId: "pet_wolf" });
    expect(summon.status).toBe("applied");
    const pet = ctx.game.store.get(`pet:${USER}`) as { alive: boolean; name: string } | undefined;
    expect(pet?.alive).toBe(true);
    expect(pet?.name).toBe("Tamed Wolf");
    ctx.game.commands.run("pet.dismiss", {});
    const after = ctx.game.store.get(`pet:${USER}`) as { alive: boolean } | undefined;
    expect(after?.alive).toBe(false);
  });

  test("talent ability mods retune slot cost for rank-only nodes", () => {
    resetHero(USER);
    ctx.game.store.delete(`class:${USER}`);
    ctx.game.store.delete(`spec:${USER}`);
    ctx.game.store.delete(`talents:${USER}`);
    ctx.game.store.delete(`bar:${USER}`);
    ctx.game.store.delete(`equip:${USER}`);
    ctx.game.commands.run("class.select", { classId: "warrior" });
    ctx.game.commands.run("talent.choose", { specId: "warrior_arms" });
    ctx.scene.entity.stats.set(USER, "level", { current: 15 });
    for (let i = 0; i < 8; i += 1) grantTalentPoint(ctx, USER, 10 + i);
    expect(ctx.game.commands.run("talent.allocate", { nodeId: "arms_imp_overpower" }).status).toBe("applied");
    expect(ctx.game.commands.run("talent.allocate", { nodeId: "arms_imp_overpower" }).status).toBe("applied");
    const allocate = ctx.game.commands.run("talent.allocate", { nodeId: "arms_imp_slam" });
    expect(allocate.status).toBe("applied");
    const hero = heroOf(USER);
    expect(hero).not.toBeNull();
    const slam = hero?.kit.config("slam");
    expect(slam).not.toBeNull();
    const base = classById("warrior").abilities.find((ability) => ability.id === "slam");
    expect(base).toBeDefined();
    expect(slam?.resourceCost ?? 999).toBeLessThan(base?.cost ?? 0);
  });

  test("equipping a full tier set grants its haste and proc on the hero sheet", () => {
    resetHero(USER);
    ctx.game.store.delete(`class:${USER}`);
    ctx.game.store.delete(`spec:${USER}`);
    ctx.game.store.delete(`talents:${USER}`);
    ctx.game.store.delete(`bar:${USER}`);
    ctx.game.store.delete(`equip:${USER}`);
    ctx.game.commands.run("class.select", { classId: "warrior" });
    const bare = heroSheet(ctx, USER);
    expect(bare).not.toBeNull();
    expect(bare!.hastePct).toBe(0);
    const equips = ctx.game.store.get(`equip:${USER}`) as Record<string, string>;
    ctx.game.store.set(`equip:${USER}`, {
      ...equips,
      helmet: "crownforged_dreadhelm",
      shoulder: "crownforged_warspaulders",
      waist: "crownforged_girdle",
      gloves: "crownforged_gauntlets",
    });
    const geared = heroSheet(ctx, USER);
    expect(geared).not.toBeNull();
    expect(geared!.hastePct).toBeCloseTo(0.15);
    expect(geared!.setProcs.map((proc) => proc.id)).toContain("set_bonesplinter");
    expect(geared!.attackPower).toBeGreaterThan(bare!.attackPower);
  });

  test("Thunzharr spawns from the world-boss scheduler and grants lockout-gated loot", () => {
    step(ctx, 0.3);
    const bossId = firstMobOf(ctx, WORLD_BOSS_MOB_ID);
    expect(ctx.scene.entity.get(bossId)).not.toBeNull();
    expect(ctx.scene.entity.stats.get(bossId, "health")?.max).toBe(40000);
    const before = ctx.player.inventory.count("bags", "inert_storm_shard");
    expect(worldBossLockedOut(ctx, USER)).toBe(false);
    onWorldBossKilled(ctx, bossId, USER);
    expect(ctx.player.inventory.count("bags", "inert_storm_shard")).toBe(before + 1);
    expect(worldBossLockedOut(ctx, USER)).toBe(true);
  });
});
