import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import type { EntityFloatTextEvent, ProjectileSettledEvent } from "../game/events";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext, type GameContextContent } from "./gameContext";

const CONTENT: GameContextContent = {
  itemById(itemId) {
    if (itemId === "zap") return { use: "zap", weapon: { damage: 50 } };
    return null;
  },
  entityById(catalogId) {
    if (catalogId === "dummy") {
      return {
        stats: { health: { max: 30 } },
        receive: { damage: { order: ["health"] } },
      };
    }
    if (catalogId === "slime") {
      return {
        stats: { health: { max: 10 } },
        receive: { damage: { order: ["health"] } },
        onDeath: { drops: [{ table: "slime-drops", when: { reason: "player_kill" } }] },
        role: "enemy",
      };
    }
    if (catalogId === "villager") {
      return { stats: { health: { max: 10 } } };
    }
    if (catalogId === "hero") {
      return {
        stats: { health: { max: 20 } },
        receive: { damage: { order: ["health"] } },
      };
    }
    return null;
  },
  objectById(catalogId) {
    if (catalogId === "chest") {
      return {
        proximityPrompt: { radius: 2, display: { kind: "label", text: "Open" }, invoke: null },
        slotInventory: { slots: 6 },
      };
    }
    return null;
  },
};

function makeContext() {
  return createGameContext({
    definition: defineGame({
      name: "TestGame",
      assets: createAssetCatalog(),
      multiplayer: "off",
      inventories: { backpack: { slots: 9 } },
    }),
    content: CONTENT,
    player: { userId: "user_a", isNew: true },
  });
}

describe("createGameContext", () => {
  test("spawn seeds pool stats from the entity catalog", () => {
    const ctx = makeContext();
    const id = ctx.scene.entity.spawn("dummy", { position: [0, 0, 0] });
    expect(ctx.scene.entity.stats.get(id, "health")).toEqual({ current: 30, max: 30, min: 0 });
    const bare = ctx.scene.entity.spawn("prop");
    expect(ctx.scene.entity.stats.get(bare, "health")).toBeNull();
  });

  test("scene.object.catalog resolves a placed object via objectById", () => {
    const ctx = makeContext();
    const chest = ctx.scene.object.place("chest", 0, 0, 0);
    expect(ctx.scene.object.catalog(chest)).toEqual({
      proximityPrompt: { radius: 2, display: { kind: "label", text: "Open" }, invoke: null },
      slotInventory: { slots: 6 },
    });
    const bare = ctx.scene.object.place("crate", 1, 0, 0);
    expect(ctx.scene.object.catalog(bare)).toBeNull();
    expect(ctx.scene.object.catalog("missing")).toBeNull();
  });

  test("scene.object.raycast hits a placed object along the ray", () => {
    const ctx = makeContext();
    const chest = ctx.scene.object.place("chest", 5, 0, 0);
    ctx.scene.object.place("crate", 0, 0, 5);
    const hit = ctx.scene.object.raycast({ origin: [0, 0, 0], direction: [1, 0, 0], maxDistance: 20 });
    expect(hit?.instanceId).toBe(chest);
    expect(hit?.catalogId).toBe("chest");
    expect(ctx.scene.object.raycastAll({ origin: [0, 0, 0], direction: [1, 0, 0], maxDistance: 20 })).toHaveLength(1);
    expect(ctx.scene.object.raycast({ origin: [0, 0, 0], direction: [0, 1, 0], maxDistance: 20 })).toBeNull();
  });

  test("scene.entity.update patches fields, notifies subscribers, and bumps version", () => {
    const ctx = makeContext();
    const id = ctx.scene.entity.spawn("villager", { position: [0, 0, 0] });
    const versionBefore = ctx.version();
    let notified = 0;
    const unsubscribe = ctx.subscribe(() => {
      notified += 1;
    });

    expect(ctx.scene.entity.update(id, { meta: { greeting: "hi" } })).toBe(true);

    expect(ctx.scene.entity.get(id)?.meta).toEqual({ greeting: "hi" });
    expect(ctx.version()).toBeGreaterThan(versionBefore);
    expect(notified).toBe(1);
    expect(ctx.scene.entity.update("missing", { meta: { greeting: "nope" } })).toBe(false);
    unsubscribe();
  });

  test("item use fires a lethal effect and entity.died reaches a bound feed", () => {
    const ctx = makeContext();
    const unbind = ctx.game.feed.bind("entity.died");
    ctx.item.use.register({
      zap: {
        apply(state, input) {
          const target = state.scene.entity.getTarget(input.from);
          if (target !== null) {
            state.scene.entity.effect({
              from: input.from,
              to: target,
              effect: "damage",
              via: { item: input.itemId },
            });
          }
          return { state };
        },
      },
    });

    const attacker = ctx.scene.entity.spawn("attacker", { position: [0, 0, 0] });
    const dummy = ctx.scene.entity.spawn("dummy", { position: [1, 0, 0] });
    ctx.scene.entity.setTarget(attacker, dummy);

    const result = ctx.item.use.use({ from: attacker, itemId: "zap" });
    expect(result.error).toBeUndefined();
    expect(ctx.scene.entity.get(dummy)).toBeNull();

    const entries = ctx.game.feed.recent("entity.died");
    expect(entries).toHaveLength(1);
    expect((entries[0]!.data as { instanceId: string }).instanceId).toBe(dummy);
    unbind();
  });

  test("lethal hit from the local player attributes a player_kill reason", () => {
    const ctx = makeContext();
    const reasons: unknown[] = [];
    ctx.game.events.on("entity.died", (event) => reasons.push(event.reason));
    ctx.scene.entity.spawn("hero", { id: "user_a", position: [0, 0, 0] });
    const slime = ctx.scene.entity.spawn("slime", { position: [1, 0, 0] });
    ctx.scene.entity.effect({ from: "user_a", to: slime, effect: "damage", via: { amount: 999 } });
    expect(reasons).toEqual([{ kind: "player_kill", killerUserId: "user_a" }]);
  });

  test("onDeath drops from a player kill fill the killer inventory and emit loot.granted", () => {
    const ctx = makeContext();
    ctx.game.loot.register({ id: "slime-drops", entries: [{ item: "goo", count: 2, weight: 1 }] });
    const granted: unknown[] = [];
    ctx.game.events.on("loot.granted", (event) => granted.push(event));
    ctx.scene.entity.spawn("hero", { id: "user_a", position: [0, 0, 0] });
    const slime = ctx.scene.entity.spawn("slime", { position: [1, 0, 0] });
    ctx.scene.entity.effect({ from: "user_a", to: slime, effect: "damage", via: { amount: 999 } });
    expect(ctx.player.inventory.count("backpack", "goo")).toBe(2);
    expect(granted).toEqual([
      { userId: "user_a", drops: [{ item: "goo", count: 2 }], source: "slime" },
    ]);
  });

  test("non-player kills grant no loot", () => {
    const ctx = makeContext();
    ctx.game.loot.register({ id: "slime-drops", entries: [{ item: "goo", count: 2, weight: 1 }] });
    const rival = ctx.scene.entity.spawn("dummy", { position: [0, 0, 0] });
    const slime = ctx.scene.entity.spawn("slime", { position: [1, 0, 0] });
    ctx.scene.entity.effect({ from: rival, to: slime, effect: "damage", via: { amount: 999 } });
    expect(ctx.scene.entity.get(slime)).toBeNull();
    expect(ctx.player.inventory.count("backpack", "goo")).toBe(0);
  });

  test("cycleTarget with hostile filter skips friendly npcs", () => {
    const ctx = makeContext();
    ctx.scene.entity.spawn("hero", { id: "user_a", position: [0, 0, 0] });
    ctx.scene.entity.spawn("villager", { position: [1, 0, 0] });
    const slime = ctx.scene.entity.spawn("slime", { position: [2, 0, 0] });
    expect(ctx.scene.entity.cycleTarget("user_a", { filter: "hostile" })).toBe(slime);
    expect(ctx.scene.entity.cycleTarget("user_a", { filter: "hostile" })).toBe(slime);
  });

  test("an entity respawned under the same id can die again", () => {
    const ctx = makeContext();
    const died: string[] = [];
    ctx.game.events.on("entity.died", (event) => died.push(event.instanceId));
    ctx.scene.entity.spawn("hero", { id: "user_a", position: [0, 0, 0] });
    const slime = ctx.scene.entity.spawn("slime", { position: [1, 0, 0] });
    ctx.scene.entity.effect({ from: slime, to: "user_a", effect: "damage", via: { amount: 999 } });
    expect(ctx.scene.entity.get("user_a")).toBeNull();
    ctx.scene.entity.spawn("hero", { id: "user_a", position: [0, 0, 0] });
    ctx.scene.entity.effect({ from: slime, to: "user_a", effect: "damage", via: { amount: 999 } });
    expect(died).toEqual(["user_a", "user_a"]);
  });

  test("applyLoadout seeds inventory, stats, and economy", () => {
    const ctx = makeContext();
    ctx.player.loadout.register({
      starterKit: {
        inventories: { backpack: [{ item: "potion", count: 3 }] },
        stats: { health: { current: 80, max: 100 } },
        economy: { gold: 25 },
      },
    });

    expect(ctx.player.applyLoadout("user_a", "starterKit")).toBeNull();
    expect(ctx.player.inventory.count("backpack", "potion")).toBe(3);
    expect(ctx.scene.entity.stats.get("user_a", "health")).toEqual({ current: 80, max: 100, min: 0 });
    expect(ctx.game.economy.balance("user_a", "gold")).toBe(25);
  });

  test("rejected loadout leaves inventory untouched", () => {
    const ctx = makeContext();
    ctx.player.loadout.register({
      broken: {
        inventories: { vault: [{ item: "potion", count: 1 }] },
      },
    });
    expect(ctx.player.applyLoadout("user_a", "broken")).toEqual({
      reason: 'vault: unknown inventory "vault"',
    });
    expect(ctx.player.inventory.count("backpack", "potion")).toBe(0);
  });
});

describe("game context change signal", () => {
  function counting(ctx: ReturnType<typeof makeContext>) {
    let fired = 0;
    const unsubscribe = ctx.subscribe(() => {
      fired += 1;
    });
    return { count: () => fired, unsubscribe };
  }

  test("spawn, despawn, and object placement notify subscribers", () => {
    const ctx = makeContext();
    const listener = counting(ctx);
    const id = ctx.scene.entity.spawn("dummy");
    expect(listener.count()).toBeGreaterThan(0);
    const afterSpawn = listener.count();
    ctx.scene.object.place("crate", 1, 0, 1);
    expect(listener.count()).toBeGreaterThan(afterSpawn);
    const afterPlace = listener.count();
    ctx.scene.entity.despawn(id);
    expect(listener.count()).toBeGreaterThan(afterPlace);
  });

  test("stat, inventory, wallet, and targeting mutations notify and bump version", () => {
    const ctx = makeContext();
    const id = ctx.scene.entity.spawn("dummy");
    const before = ctx.version();
    ctx.scene.entity.stats.delta(id, "health", -5);
    ctx.player.inventory.put("backpack", "potion", 2);
    ctx.game.economy.grant("user_a", "gold", 10);
    ctx.scene.entity.setTarget("user_a", id);
    expect(ctx.version()).toBeGreaterThanOrEqual(before + 4);
  });

  test("events, feed pushes, and quest mutations notify", () => {
    const ctx = makeContext();
    const listener = counting(ctx);
    ctx.game.feed.push("chat", { text: "hi" });
    expect(listener.count()).toBe(1);
    ctx.game.events.emit("stat.levelUp", { userId: "user_a", stat: "mining", level: 2 });
    expect(listener.count()).toBe(2);
    ctx.game.quest.register([
      { id: "q1", objectives: [{ id: "o1", count: 1 }], rewards: {} },
    ]);
    ctx.game.quest.accept("user_a", "q1");
    expect(listener.count()).toBeGreaterThan(2);
    listener.unsubscribe();
    ctx.game.feed.push("chat", { text: "bye" });
    expect(listener.count()).toBeGreaterThan(2);
  });

  test("ctx.game.state set/update/invalidate bump ctx.version and notify subscribers", () => {
    const ctx = makeContext();
    const listener = counting(ctx);
    const before = ctx.version();
    const handle = ctx.game.state.define("combo", 0);
    ctx.game.state.set("combo", 1);
    expect(ctx.version()).toBeGreaterThan(before);
    const afterSet = ctx.version();
    ctx.game.state.update("combo", (current: number) => current + 1);
    expect(handle.get()).toBe(2);
    expect(ctx.version()).toBeGreaterThan(afterSet);
    const afterUpdate = ctx.version();
    ctx.game.state.invalidate();
    expect(ctx.version()).toBeGreaterThan(afterUpdate);
    expect(listener.count()).toBeGreaterThan(0);
  });
});

describe("float text and projectile events", () => {
  test("a damaging effect auto-emits an entity.floatText over the target", () => {
    const ctx = makeContext();
    const floats: EntityFloatTextEvent[] = [];
    ctx.game.events.on("entity.floatText", (event) => floats.push(event));
    const attacker = ctx.scene.entity.spawn("attacker", { position: [0, 0, 0] });
    const dummy = ctx.scene.entity.spawn("dummy", { position: [1, 2, 3] });
    ctx.scene.entity.effect({ from: attacker, to: dummy, effect: "damage", via: { amount: 12 } });
    expect(floats).toEqual([
      { instanceId: dummy, position: [1, 2, 3], text: "12", kind: "damage", amount: 12 },
    ]);
  });

  test("a restoring effect emits a heal-kind float text", () => {
    const ctx = makeContext();
    const attacker = ctx.scene.entity.spawn("attacker", { position: [0, 0, 0] });
    const dummy = ctx.scene.entity.spawn("dummy", { position: [0, 0, 0] });
    ctx.scene.entity.effect({ from: attacker, to: dummy, effect: "damage", via: { amount: 20 } });
    const heals: EntityFloatTextEvent[] = [];
    ctx.game.events.on("entity.floatText", (event) => heals.push(event));
    ctx.scene.entity.effect({ from: attacker, to: dummy, effect: "damage", via: { amount: -5 } });
    expect(heals).toEqual([
      { instanceId: dummy, position: [0, 0, 0], text: "5", kind: "heal", amount: 5 },
    ]);
  });

  test("the floatText verb resolves position from the instance id", () => {
    const ctx = makeContext();
    const events: EntityFloatTextEvent[] = [];
    ctx.game.events.on("entity.floatText", (event) => events.push(event));
    const dummy = ctx.scene.entity.spawn("dummy", { position: [4, 0, -2] });
    ctx.scene.entity.floatText({ instanceId: dummy, text: "Crit!", kind: "info" });
    expect(events).toEqual([{ instanceId: dummy, position: [4, 0, -2], text: "Crit!", kind: "info" }]);
  });

  test("settling a projectile emits projectile.settled with origin and hit flag", () => {
    const ctx = makeContext();
    const shots: ProjectileSettledEvent[] = [];
    ctx.game.events.on("projectile.settled", (event) => shots.push(event));
    const attacker = ctx.scene.entity.spawn("attacker", { position: [0, 0, 0] });
    ctx.scene.entity.spawn("dummy", { position: [3, 0, 0] });
    const shotId = ctx.scene.entity.fireProjectile({
      from: attacker,
      via: { item: "zap" },
      aim: { yaw: Math.PI / 2, pitch: 0 },
      effect: "damage",
    });
    const settle = ctx.scene.entity.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    expect(shots).toHaveLength(1);
    expect(shots[0]!.from).toBe(attacker);
    expect(shots[0]!.hit).toBe(true);
    expect(shots[0]!.origin).toEqual([0, 0, 0]);
  });
});
