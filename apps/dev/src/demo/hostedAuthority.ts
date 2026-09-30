import { defineGameDefinition, type GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { ws } from "@jgengine/core/runtime/adapter";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const AUTHORITY_FIXTURE_ID = "hosted-authority";
type Profile = { chosen: boolean; cooldownUntil: number; respawnAt: number; casts: number };
export type AuthorityView = Profile & { userId: string; time: number; coins: number; xp: number; loot: number; quest: string; progress: number; target: string | null; position: readonly number[]; members: number; ticks: number };
const profileKey = (userId: string) => `relay.profile:${userId}`;
const profileOf = (ctx: GameContext, userId: string) => ctx.game.store.get(profileKey(userId)) as Profile | undefined;
const put = (ctx: GameContext, userId: string, patch: Partial<Profile>) => ctx.game.store.set(profileKey(userId), { ...profileOf(ctx, userId), ...patch });

function onInit(ctx: GameContext): void {
  ctx.game.loot.register({ id: "relay-token", entries: [{ item: "token", count: 1, weight: 1 }] });
  ctx.game.quest!.register([{ id: "first-signal", title: "First signal", objectives: [{ id: "signal", kind: "kill", target: "signal", count: 1 }], rewards: { xp: { amount: 5 }, economy: { copper: 5 } } }]);
  ctx.game.quest!.bind("entity.died");
  ctx.game.commands.define("class.choose", {
    validate: (state) => profileOf(state, state.player.userId)?.chosen ? { reason: "already-chosen" } : state.game.economy.balance(state.player.userId, "copper") < 3 ? { reason: "insufficient-funds" } : null,
    apply(state) { state.game.economy.charge(state.player.userId, "copper", 3); put(state, state.player.userId, { chosen: true }); },
  });
  ctx.game.commands.define("quest.accept", {
    validate: (state) => state.game.quest!.canAccept(state.player.userId, "first-signal"),
    apply: (state) => { state.game.quest!.accept(state.player.userId, "first-signal"); },
  });
  ctx.game.commands.define("quest.turnIn", {
    validate: (state) => state.game.quest!.canTurnIn(state.player.userId, "first-signal"),
    apply: (state) => { state.game.quest!.turnIn(state.player.userId, "first-signal"); },
  });
  ctx.game.commands.define("target.cycle", { apply(state) {
    const userId = state.player.userId;
    const existing = state.scene.entity.getTarget(userId);
    if (existing !== null && state.scene.entity.get(existing) !== null) return;
    state.scene.entity.setTarget(userId, state.scene.entity.spawn("signal"));
  } });
  ctx.game.commands.define("target.clear", { apply: (state) => { state.scene.entity.setTarget(state.player.userId, null); } });
  ctx.game.commands.define("reward.signal", { apply(state) {
    state.scene.entity.stats.delta(state.player.userId, "xp", 7);
  } });
  ctx.game.commands.define("cast", {
    validate(state) {
      const profile = profileOf(state, state.player.userId);
      if (!profile?.chosen) return { reason: "choose-courier" };
      if (profile.respawnAt > state.time.now()) return { reason: "respawning" };
      if (profile.cooldownUntil > state.time.now()) return { reason: "cooldown" };
      const target = state.scene.entity.getTarget(state.player.userId);
      return target !== null && state.scene.entity.get(target)?.name === "signal" ? null : { reason: "choose-target" };
    },
    apply(state) {
      const userId = state.player.userId;
      const profile = profileOf(state, userId)!;
      state.scene.entity.effect({ from: userId, to: state.scene.entity.getTarget(userId)!, effect: "damage", via: { amount: 10 } });
      state.scene.entity.setTarget(userId, null);
      put(state, userId, { casts: profile.casts + 1, cooldownUntil: state.time.now() + 4 });
    },
  });
  ctx.game.commands.define("down", {
    validate: (state) => profileOf(state, state.player.userId)!.respawnAt > state.time.now() ? { reason: "respawning" } : null,
    apply(state) {
      state.scene.entity.stats.set(state.player.userId, "health", { current: 0 });
      state.scene.entity.update(state.player.userId, { movement: { frozen: true } });
      put(state, state.player.userId, { respawnAt: state.time.now() + 3 });
    },
  });
}

function onTick(ctx: GameContext): void {
  for (const player of ctx.game.players!.list()) {
    const userId = player.userId;
    let profile = profileOf(ctx, userId);
    if (profile === undefined) continue;
    if (profile.respawnAt > 0 && ctx.time.now() >= profile.respawnAt) {
      ctx.scene.entity.stats.set(userId, "health", { current: 20 });
      ctx.scene.entity.update(userId, { movement: { walkSpeed: 4, frozen: false } });
      ctx.scene.entity.resetToSpawn(userId);
      put(ctx, userId, { respawnAt: 0 });
      profile = profileOf(ctx, userId)!;
    }
    const quest = ctx.game.quest!.list(userId)[0];
    const view: AuthorityView = {
      ...profile, userId, time: Math.floor(ctx.time.now() * 10) / 10,
      coins: ctx.game.economy.balance(userId, "copper"), xp: ctx.scene.entity.stats.get(userId, "xp")?.current ?? 0,
      loot: ctx.player.inventoryFor(userId).count("backpack", "token"),
      quest: quest?.status ?? "available", progress: quest?.objectives[0]?.progress ?? 0,
      target: ctx.scene.entity.getTarget(userId), position: ctx.scene.entity.get(userId)?.position ?? [],
      members: ctx.game.players!.count(), ticks: ctx.sim.tick(),
    };
    ctx.game.store.set(`relay.view:${userId}`, view);
  }
}

export const authorityLoop: GameLoop<GameContext> = {
  onInit,
  onNewPlayer(ctx, player) {
    const userId = player?.userId ?? ctx.player.userId;
    if (ctx.scene.entity.get(userId) !== null) return;
    ctx.scene.entity.spawn("courier", { id: userId, role: "player" });
    if (profileOf(ctx, userId) === undefined) {
      ctx.game.economy.grant(userId, "copper", 20);
      ctx.game.store.set(profileKey(userId), { chosen: false, cooldownUntil: 0, respawnAt: 0, casts: 0 } satisfies Profile);
    }
  },
  onTick,
};

export const authorityDefinition = defineGameDefinition({
  name: "Relay Courtyard", assets: createAssetCatalog(),
  multiplayer: ws({ authority: "server", topology: "shared", url: "ws://127.0.0.1:4625/ws" }),
  server: "persistent", features: { players: true, quest: true }, inventories: { backpack: { slots: 8 } },
  simulation: { hz: 30 }, loop: authorityLoop,
  input: { cast: ["Space"], moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

export const authorityContent: GameContextContent = {
  entityById: (id): GameContextEntityEntry | null => id === "courier"
    ? { movement: { walkSpeed: 4 }, stats: { health: { max: 20 }, xp: { current: 0, max: 1000 } } }
    : id === "signal" ? { stats: { health: { max: 10 } }, receive: { damage: { order: ["health"] } }, onDeath: { drops: "relay-token", command: "reward.signal" } } : null,
  itemById: (id) => id === "token" ? { rarity: "common" } : null,
};
