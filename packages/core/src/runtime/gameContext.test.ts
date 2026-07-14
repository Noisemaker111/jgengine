import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import type { CombatVfxEvent, EntityFloatTextEvent, ProjectileSettledEvent } from "../game/events";
import { raceTrack, type Checkpoint } from "@jgengine/core/game/race";
import { createAssetCatalog } from "../scene/assetCatalog";
import { environment, terrain } from "../world/features";
import { resolveTerrainField } from "../world/terrain";
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
      features: { roster: true, cards: true, turn: true, race: true },
    }),
    content: CONTENT,
    player: { userId: "user_a", isNew: true },
  });
}

describe("opt-in features", () => {
  test("omitted features leave their ctx.game slots undefined", () => {
    const ctx = createGameContext({
      definition: defineGame({ name: "Slim", assets: createAssetCatalog(), multiplayer: "off" }),
      content: CONTENT,
      player: { userId: "user_a", isNew: true },
    });
    expect(ctx.game.roster).toBeUndefined();
    expect(ctx.game.cards).toBeUndefined();
    expect(ctx.game.turn).toBeUndefined();
    expect(ctx.game.race).toBeUndefined();
    expect(ctx.game.leaderboard).toBeUndefined();
    expect(ctx.game.social).toBeUndefined();
    expect(ctx.game.chat).toBeUndefined();
    expect(ctx.game.players).toBeUndefined();
    expect(ctx.game.commands).toBeDefined();
    expect(ctx.game.store).toBeDefined();
    expect(ctx.game.commands.actor()).toBeNull();
  });

  test("opted-in features are built", () => {
    const ctx = createGameContext({
      definition: defineGame({
        name: "Full",
        assets: createAssetCatalog(),
        multiplayer: "off",
        features: { roster: true, cards: true, turn: true, race: true, leaderboard: true, social: true, chat: true },
      }),
      content: CONTENT,
      player: { userId: "user_a", isNew: true },
    });
    expect(ctx.game.roster).toBeDefined();
    expect(ctx.game.cards).toBeDefined();
    expect(ctx.game.turn).toBeDefined();
    expect(ctx.game.race).toBeDefined();
    expect(ctx.game.leaderboard).toBeDefined();
    expect(ctx.game.social).toBeDefined();
    expect(ctx.game.chat).toBeDefined();
  });

  test("chat opts in social implicitly (chat depends on it)", () => {
    const ctx = createGameContext({
      definition: defineGame({ name: "ChatOnly", assets: createAssetCatalog(), multiplayer: "off", features: { chat: true } }),
      content: CONTENT,
      player: { userId: "user_a", isNew: true },
    });
    expect(ctx.game.chat).toBeDefined();
    // chat builds its own social backing, but ctx.game.social stays off unless explicitly requested
    expect(ctx.game.social).toBeUndefined();
  });
});

describe("createGameContext", () => {
  test("world.groundHeightAt samples the declared environment terrain and is flat without one", () => {
    const descriptor = terrain({ height: 2.4, seed: "ctx-ground" });
    const ctx = createGameContext({
      definition: defineGame({
        name: "GroundGame",
        assets: createAssetCatalog(),
        multiplayer: "off",
        world: environment({ terrain: descriptor }),
      }),
      content: CONTENT,
      player: { userId: "user_a", isNew: true },
    });
    const reference = resolveTerrainField(descriptor);
    expect(ctx.world.groundHeightAt(7.5, -19)).toBe(reference.sampleHeight(7.5, -19));
    expect(ctx.world.ground.sampleNormal(7.5, -19)).toEqual(reference.sampleNormal(7.5, -19));
    expect(makeContext().world.groundHeightAt(7.5, -19)).toBe(0);
  });

  test("game.audio routes play and resume through the audio events", () => {
    const ctx = makeContext();
    const played: { sound: string; at?: readonly [number, number, number] }[] = [];
    let resumed = 0;
    ctx.game.events.on("audio.play", (event) => played.push(event));
    ctx.game.events.on("audio.resume", () => {
      resumed += 1;
    });
    ctx.game.audio.play("chime");
    ctx.game.audio.play("boom", [1, 2, 3]);
    ctx.game.audio.resume();
    expect(played).toEqual([{ sound: "chime" }, { sound: "boom", at: [1, 2, 3] }]);
    expect(resumed).toBe(1);
  });

  test("telegraph cancel removes the visual even with no bound effect", () => {
    const ctx = makeContext();
    const cancelled: number[] = [];
    ctx.game.events.on("combat.telegraphCancelled", (event) => cancelled.push(event.id));
    let firedId = -1;
    ctx.game.events.on("combat.telegraph", (event) => {
      firedId = event.id;
    });
    const cancel = ctx.scene.entity.telegraph({
      from: "user_a",
      shape: { kind: "circle", radius: 3 },
      at: [0, 0, 0],
      windupMs: 500,
    });
    expect(firedId).toBeGreaterThanOrEqual(0);
    cancel();
    expect(cancelled).toEqual([firedId]);
  });

  test("spawn seeds pool stats from the entity catalog", () => {
    const ctx = makeContext();
    const id = ctx.scene.entity.spawn("dummy", { position: [0, 0, 0] });
    expect(ctx.scene.entity.stats.get(id, "health")).toEqual({ current: 30, max: 30, min: 0 });
    const bare = ctx.scene.entity.spawn("prop");
    expect(ctx.scene.entity.stats.get(bare, "health")).toBeNull();
  });

  test("without an occluder, entity and AoE LoS stay open", () => {
    const ctx = makeContext();
    const a = ctx.scene.entity.spawn("dummy", { position: [0, 0, 0] });
    const b = ctx.scene.entity.spawn("dummy", { position: [0, 0, 8] });
    expect(ctx.scene.entity.hasLineOfSight(a, b)).toBe(true);
    ctx.scene.entity.effect({
      from: a,
      effect: "damage",
      via: { amount: 5 },
      at: [0, 0, 0],
      radius: 10,
    });
    expect(ctx.scene.entity.stats.get(b, "health")?.current).toBe(25);
  });

  test("occluder blocks entity LoS and position-origin AoE through walls", () => {
    const ctx = createGameContext({
      definition: defineGame({
        name: "LosGame",
        assets: createAssetCatalog(),
        multiplayer: "off",
      }),
      content: CONTENT,
      player: { userId: "user_a", isNew: true },
      occluder: (from, to) => {
        const crossesWall =
          Math.min(from[2], to[2]) < 4 && Math.max(from[2], to[2]) > 4 && Math.abs(from[0] - to[0]) < 0.01;
        return crossesWall;
      },
    });
    const shooter = ctx.scene.entity.spawn("dummy", { position: [0, 0, 0] });
    const behindWall = ctx.scene.entity.spawn("dummy", { position: [0, 0, 8] });
    const open = ctx.scene.entity.spawn("dummy", { position: [5, 0, 2] });
    expect(ctx.scene.entity.hasLineOfSight(shooter, behindWall)).toBe(false);
    expect(ctx.scene.entity.hasLineOfSight(shooter, open)).toBe(true);
    ctx.scene.entity.effect({
      from: shooter,
      effect: "damage",
      via: { amount: 5 },
      at: [0, 0, 0],
      radius: 12,
    });
    expect(ctx.scene.entity.stats.get(behindWall, "health")?.current).toBe(30);
    expect(ctx.scene.entity.stats.get(open, "health")?.current).toBe(25);
  });

  test("scene.entity.update patches movement and rotation, bumps version, and is readable via get", () => {
    const ctx = makeContext();
    const id = ctx.scene.entity.spawn("dummy", { position: [0, 0, 0] });
    const before = ctx.version();
    expect(ctx.scene.entity.update(id, { movement: { walkSpeed: 4 }, rotationY: 1.5 })).toBe(true);
    expect(ctx.version()).toBeGreaterThan(before);
    const entity = ctx.scene.entity.get(id);
    expect(entity?.movement).toEqual({ walkSpeed: 4 });
    expect(entity?.rotationY).toBe(1.5);
    expect(ctx.scene.entity.update("missing", { rotationY: 2 })).toBe(false);
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

  test("spatial grid auto-invalidates after setPose and scene.raycast hits entities", () => {
    const ctx = makeContext();
    const id = ctx.scene.entity.spawn("dummy", { position: [100, 0, 100] });
    expect(ctx.scene.entity.inRadius([0, 0, 0], 5)).toEqual([]);
    ctx.scene.entity.setPose(id, { position: [1, 0, 1] });
    expect(ctx.scene.entity.inRadius([0, 0, 0], 5)).toEqual([id]);

    ctx.scene.entity.setColliders(id, {
      hitboxes: [{ name: "head", purpose: "damage", shape: { kind: "sphere", radius: 0.3, offset: [0, 1.5, 0] } }],
    });
    const hit = ctx.scene.raycast({ origin: [1, 1.5, -5], direction: [0, 0, 1], maxDistance: 20 });
    expect(hit?.instanceId).toBe(id);
    expect(hit?.colliderName).toBe("head");
    expect(hit?.damageEligible).toBe(true);
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

  test("feed.limit config caps entries retained per action", () => {
    const ctx = createGameContext({
      definition: defineGame({
        name: "FeedLimitGame",
        assets: createAssetCatalog(),
        multiplayer: "off",
        feed: { limit: 3 },
      }),
      content: CONTENT,
      player: { userId: "user_a", isNew: true },
    });

    for (let i = 0; i < 5; i++) ctx.game.feed.push("chat", i);

    const recent = ctx.game.feed.recent("chat");
    expect(recent).toHaveLength(3);
    expect(recent.map((entry) => entry.data)).toEqual([2, 3, 4]);
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

  test("the vfx verb resolves endpoints from instance ids and defaults duration", () => {
    const ctx = makeContext();
    const events: CombatVfxEvent[] = [];
    ctx.game.events.on("combat.vfx", (event) => events.push(event));
    const caster = ctx.scene.entity.spawn("caster", { position: [0, 0, 0] });
    const target = ctx.scene.entity.spawn("target", { position: [5, 0, 1] });
    ctx.scene.entity.vfx({ kind: "projectile", color: 0x8ed2ff, from: caster, to: target });
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("projectile");
    expect(events[0]!.color).toBe(0x8ed2ff);
    expect(events[0]!.from).toEqual([0, 0, 0]);
    expect(events[0]!.to).toEqual([5, 0, 1]);
    expect(events[0]!.durationMs).toBeGreaterThan(0);
    ctx.scene.entity.vfx({ kind: "nova", color: 0xff7a2a, from: [2, 0, 2], radius: 6 });
    expect(events[1]!.from).toEqual([2, 0, 2]);
    expect(events[1]!.radius).toBe(6);
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
    expect(shots[0]!.origin[0]).toBeCloseTo(0);
    expect(shots[0]!.origin[1]).toBeCloseTo(1.4);
    expect(shots[0]!.origin[2]).toBeCloseTo(0.35);
  });

  test("scene.entity.resetToSpawn restores the recorded spawn pose and resetAllToSpawn counts matches", () => {
    const ctx = makeContext();
    const hero = ctx.scene.entity.spawn("hero", { position: [1, 0, 1], rotationY: 0.4 });
    const villager = ctx.scene.entity.spawn("villager", { position: [2, 0, 2], rotationY: 0 });
    ctx.scene.entity.setPose(hero, { position: [9, 0, 9], rotationY: 2 });
    ctx.scene.entity.setPose(villager, { position: [8, 0, 8], rotationY: 1 });

    expect(ctx.scene.entity.spawnPoseOf(hero)).toEqual({ position: [1, 0, 1], rotationY: 0.4 });
    expect(ctx.scene.entity.resetToSpawn(hero)).toBe(true);
    expect(ctx.scene.entity.get(hero)?.position).toEqual([1, 0, 1]);
    expect(ctx.scene.entity.get(villager)?.position).toEqual([8, 0, 8]);

    const resetCount = ctx.scene.entity.resetAllToSpawn((entity) => entity.name === "villager");
    expect(resetCount).toBe(1);
    expect(ctx.scene.entity.get(villager)?.position).toEqual([2, 0, 2]);
  });

  test("scene.entity.paint bumps ctx.version on paint and clear", () => {
    const ctx = makeContext();
    const before = ctx.version();
    ctx.scene.entity.paint.paint("car-1", { u: 0.5, v: 0.5, radius: 0.1, color: "#ff0000" });
    expect(ctx.scene.entity.paint.strokes("car-1")).toEqual([{ u: 0.5, v: 0.5, radius: 0.1, color: "#ff0000" }]);
    expect(ctx.version()).toBeGreaterThan(before);
    const afterPaint = ctx.version();
    ctx.scene.entity.paint.clear("car-1");
    expect(ctx.scene.entity.paint.strokes("car-1")).toEqual([]);
    expect(ctx.version()).toBeGreaterThan(afterPaint);
  });
});

describe("game.store", () => {
  test("set bumps ctx.version and notifies ctx.subscribe listeners; get reads it back", () => {
    const ctx = makeContext();
    let calls = 0;
    ctx.subscribe(() => calls++);
    const before = ctx.version();
    ctx.game.store.set("score", 42);
    expect(ctx.game.store.get("score")).toBe(42);
    expect(ctx.version()).toBeGreaterThan(before);
    expect(calls).toBe(1);
  });

  test("delete also bumps version and notifies", () => {
    const ctx = makeContext();
    ctx.game.store.set("flag", true);
    let calls = 0;
    ctx.subscribe(() => calls++);
    ctx.game.store.delete("flag");
    expect(ctx.game.store.has("flag")).toBe(false);
    expect(calls).toBe(1);
  });
});

describe("game.cards.pile", () => {
  test("returns the same instance for the same id, requires config only on first access", () => {
    const ctx = makeContext();
    const a = ctx.game.cards!.pile("deck", { zones: ["draw", "hand", "discard"] });
    const b = ctx.game.cards!.pile("deck");
    expect(b).toBe(a);
  });

  test("throws when a pile has not been created yet and no config is given", () => {
    const ctx = makeContext();
    expect(() => ctx.game.cards!.pile("missing")).toThrow();
  });

  test("mutating a pile bumps ctx.version", () => {
    const ctx = makeContext();
    const deck = ctx.game.cards!.pile("deck", {
      zones: ["draw", "hand", "discard"],
      drawFrom: "draw",
      handZone: "hand",
      discardTo: "discard",
    });
    deck.reset({ zones: { draw: ["a", "b", "c"], hand: [], discard: [] } });
    const before = ctx.version();
    const drawn = deck.draw(2);
    expect(drawn).toEqual(["a", "b"]);
    expect(ctx.version()).toBeGreaterThan(before);
  });
});

describe("game.turn.loop", () => {
  test("returns the same instance for the same id, requires config only on first access", () => {
    const ctx = makeContext();
    const a = ctx.game.turn!.loop("combat", { order: ["hero", "slime"] });
    const b = ctx.game.turn!.loop("combat");
    expect(b).toBe(a);
  });

  test("throws when a loop has not been created yet and no config is given", () => {
    const ctx = makeContext();
    expect(() => ctx.game.turn!.loop("missing")).toThrow();
  });

  test("advanceTurn bumps ctx.version", () => {
    const ctx = makeContext();
    const loop = ctx.game.turn!.loop("combat", { order: ["hero", "slime"] });
    const before = ctx.version();
    loop.advanceTurn();
    expect(ctx.version()).toBeGreaterThan(before);
    expect(loop.active()).toBe("slime");
  });

  test("commit.submit on the sub-controller also bumps ctx.version", () => {
    const ctx = makeContext();
    const loop = ctx.game.turn!.loop("simul", {
      order: ["hero", "slime"],
      commit: { mode: "simultaneous" },
    });
    const before = ctx.version();
    loop.commit.submit("hero", { move: "attack" });
    expect(ctx.version()).toBeGreaterThan(before);
  });
});

describe("ctx.camera", () => {
  test("follow/clear round-trips and distinguishes undefined from null", () => {
    const ctx = makeContext();
    expect(ctx.camera.followedEntityId()).toBeUndefined();
    ctx.camera.follow("hero-1");
    expect(ctx.camera.followedEntityId()).toBe("hero-1");
    ctx.camera.follow(null);
    expect(ctx.camera.followedEntityId()).toBeNull();
  });

  test("follow and setCinematic notify ctx.subscribe and bump ctx.version", () => {
    const ctx = makeContext();
    let calls = 0;
    ctx.subscribe(() => calls++);
    const before = ctx.version();
    ctx.camera.follow("hero-1");
    expect(ctx.version()).toBeGreaterThan(before);
    expect(calls).toBe(1);
    ctx.camera.setCinematic({ keyframes: [{ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 1 } }] });
    expect(ctx.camera.cinematic()).not.toBeNull();
    expect(calls).toBe(2);
  });
});

describe("ctx.input", () => {
  test("publish replaces the held set and is readable via isDown/held", () => {
    const ctx = makeContext();
    ctx.input.publish(["jump", "fire"]);
    expect(ctx.input.isDown("jump")).toBe(true);
    expect(ctx.input.isDown("crouch")).toBe(false);
    expect(ctx.input.held()).toEqual(["jump", "fire"]);
    ctx.input.publish(["crouch"]);
    expect(ctx.input.isDown("jump")).toBe(false);
    expect(ctx.input.isDown("crouch")).toBe(true);
  });

  test("publish does not bump ctx.version", () => {
    const ctx = makeContext();
    const before = ctx.version();
    ctx.input.publish(["jump"]);
    expect(ctx.version()).toBe(before);
  });
});

describe("ctx.player.motion", () => {
  test("is reachable and round-trips an impulse via takePending", () => {
    const ctx = makeContext();
    ctx.player.motion.impulse(7);
    expect(ctx.player.motion.takePending()).toEqual({
      impulses: [7],
      horizontalImpulses: [],
      verticalVelocity: null,
      y: null,
    });
  });

  test("impulse does not bump ctx.version", () => {
    const ctx = makeContext();
    const before = ctx.version();
    ctx.player.motion.impulse(7);
    ctx.player.motion.setVerticalVelocity(3);
    ctx.player.motion.setY(1);
    expect(ctx.version()).toBe(before);
  });
});

describe("ctx.scene.entity.setPoseConstraint", () => {
  test("wires through to the entity store: constrains setPose to a fixed point", () => {
    const ctx = makeContext();
    const id = ctx.scene.entity.spawn("dummy", { position: [0, 0, 0] });
    ctx.scene.entity.setPoseConstraint(id, () => [1, 0, 1]);
    ctx.scene.entity.setPose(id, { position: [50, 0, 50] });
    expect(ctx.scene.entity.get(id)?.position).toEqual([1, 0, 1]);
  });
});

describe("ctx.game.race.state", () => {
  function line(id: string, x: number, z: number): Checkpoint {
    return { id, center: [x, 0, z], half: [3, 5, 3] };
  }

  function track() {
    return raceTrack({
      checkpoints: [line("start", 0, 0), line("cp1", 20, 0), line("finish", 20, 20)],
    });
  }

  test("creates on first call with config and returns the same instance subsequently", () => {
    const ctx = makeContext();
    const a = ctx.game.race!.state("main", { track: track() });
    const b = ctx.game.race!.state("main");
    expect(b).toBe(a);
  });

  test("throws when accessed without a config before creation", () => {
    const ctx = makeContext();
    expect(() => ctx.game.race!.state("missing")).toThrow();
  });

  test("addRacer bumps ctx.version", () => {
    const ctx = makeContext();
    const race = ctx.game.race!.state("main", { track: track() });
    const before = ctx.version();
    race.addRacer("p1");
    expect(ctx.version()).toBeGreaterThan(before);
  });

  test("update with no events does not bump ctx.version", () => {
    const ctx = makeContext();
    const race = ctx.game.race!.state("main", { track: track() });
    race.addRacer("p1");
    const before = ctx.version();
    race.update(0, { p1: [-50, 0, -50] });
    expect(ctx.version()).toBe(before);
  });

  test("update that hits a checkpoint bumps ctx.version", () => {
    const ctx = makeContext();
    const race = ctx.game.race!.state("main", { track: track() });
    race.addRacer("p1");
    const before = ctx.version();
    race.update(0, { p1: [0, 0, 0] });
    expect(ctx.version()).toBeGreaterThan(before);
  });
});

describe("ctx.snapshot / ctx.hydrate", () => {
  function fullContext(userId: string) {
    return createGameContext({
      definition: defineGame({
        name: "Replicated",
        assets: createAssetCatalog(),
        multiplayer: "off",
        features: { leaderboard: true, social: true, chat: true },
      }),
      content: CONTENT,
      player: { userId, isNew: true },
    });
  }

  test("snapshot only carries opted-in modules plus always-on live state", () => {
    const slim = createGameContext({
      definition: defineGame({ name: "Slim", assets: createAssetCatalog(), multiplayer: "off" }),
      content: CONTENT,
      player: { userId: "user_a", isNew: true },
    });
    const snap = slim.snapshot();
    expect(Object.keys(snap).sort()).toEqual(["entities", "feed", "inventory", "stats", "store"]);
    expect(snap["leaderboard"]).toBeUndefined();
    expect(snap["chat"]).toBeUndefined();
  });

  test("roundtrips entities, stats, store, leaderboard and chat into a fresh context", () => {
    const host = fullContext("user_a");
    const id = host.scene.entity.spawn("dummy", { position: [1, 0, 2] });
    host.scene.entity.stats.set(id, "health", { current: 12, max: 30, min: 0 });
    host.game.store.set("phase", "combat");
    host.game.leaderboard!.track({ stat: "kills", scope: "global" });
    host.game.leaderboard!.increment("user_a", "kills", { scope: "global", by: 3 });
    host.game.chat!.send("user_a", "global", "gg");

    const snap = host.snapshot();

    const client = fullContext("user_b");
    const before = client.version();
    client.hydrate(snap);

    expect(client.version()).toBeGreaterThan(before);
    expect(client.scene.entity.get(id)?.position).toEqual([1, 0, 2]);
    expect(client.scene.entity.stats.get(id, "health")).toEqual({ current: 12, max: 30, min: 0 });
    expect(client.game.store.get("phase")).toBe("combat");
    expect(client.game.leaderboard!.getTop("kills", { scope: "global" })).toEqual([
      { userId: "user_a", value: 3 },
    ]);
    expect(client.game.chat!.history("global").map((m) => m.body)).toEqual(["gg"]);
  });

  test("hydrate leaves modules whose key is absent from the snapshot untouched", () => {
    const client = fullContext("user_b");
    client.game.store.set("keep", 1);
    client.hydrate({ store: [["replaced", 2]] });
    expect(client.game.store.get("keep")).toBeUndefined();
    expect(client.game.store.get("replaced")).toBe(2);
    expect(client.game.chat!.channels().length).toBeGreaterThan(0);
  });
});
