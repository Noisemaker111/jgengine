import { createLevelSequence, type LevelSequence } from "@jgengine/core/game/levelSequence";
import { seededStreams } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { despawnMob, isMobInstance, spawnMobAt } from "../ai/mobs";
import { mobById } from "../entities/enemies/catalog";
import { teleportHero } from "../session/hero";
import { DELVES, delveById, levelForTier, type DelveDef, type DelveTier } from "./catalog";

const COMPANION_CATALOG = "delve_companion";

export interface ChamberConfig {
  templateId: string;
  name: string;
  mobIds: readonly string[];
  level: number;
  boss: boolean;
}

export interface DelveSessionView {
  delveId: string;
  tier: DelveTier;
  chamberIndex: number;
  chamberName: string;
  totalChambers: number;
  remaining: number;
  companionId: string | null;
  status: "playing" | "cleared" | "complete" | "idle";
}

interface ActiveDelve {
  def: DelveDef;
  tier: DelveTier;
  sequence: LevelSequence<ChamberConfig>;
  seed: string;
  spawned: string[];
  companionId: string | null;
  returnPos: readonly [number, number];
}

const active = new Map<string, ActiveDelve>();

export function delveSessionOf(userId: string): DelveSessionView | null {
  const session = active.get(userId);
  if (session === undefined) return null;
  const current = session.sequence.current();
  const progress = session.sequence.progress();
  return {
    delveId: session.def.id,
    tier: session.tier,
    chamberIndex: progress.index,
    chamberName: current?.config.name ?? session.def.name,
    totalChambers: progress.total,
    remaining: session.spawned.filter((id) => isMobInstance(id)).length,
    companionId: session.companionId,
    status:
      session.sequence.status() === "complete"
        ? "complete"
        : session.sequence.status() === "cleared"
          ? "cleared"
          : session.sequence.status() === "playing"
            ? "playing"
            : "idle",
  };
}

function buildChambers(def: DelveDef, tier: DelveTier, seed: string): LevelSequence<ChamberConfig> {
  const stream = seededStreams(seed)("chambers");
  const levels = def.chambers.map((template, index) => {
    const level = levelForTier(def.baseLevel, tier, index);
    const mobIds: string[] = [];
    for (let i = 0; i < template.count; i += 1) {
      const pick = template.mobPool[Math.floor(stream() * template.mobPool.length)] ?? template.mobPool[0];
      if (pick !== undefined) mobIds.push(pick);
    }
    return {
      id: template.id,
      config: {
        templateId: template.id,
        name: template.name,
        mobIds,
        level,
        boss: template.boss === true,
      } satisfies ChamberConfig,
    };
  });
  return createLevelSequence({ levels, retriesPerLevel: 0 });
}

function clearSpawned(ctx: GameContext, session: ActiveDelve): void {
  for (const id of session.spawned) despawnMob(ctx, id);
  session.spawned = [];
}

function spawnChamber(ctx: GameContext, session: ActiveDelve): void {
  clearSpawned(ctx, session);
  const current = session.sequence.current();
  if (current === null) return;
  const { config } = current;
  const roll = seededStreams(`${session.seed}:${config.templateId}`)("place");
  for (let i = 0; i < config.mobIds.length; i += 1) {
    const mobId = config.mobIds[i];
    if (mobId === undefined) continue;
    const def = mobById(mobId);
    if (def === null) continue;
    const angle = roll() * Math.PI * 2;
    const radius = 4 + roll() * Math.max(3, session.def.radius - 8);
    const x = session.def.center[0] + Math.cos(angle) * radius;
    const z = session.def.center[1] + Math.sin(angle) * radius;
    const level = config.boss && i === config.mobIds.length - 1 ? config.level + 1 : config.level;
    session.spawned.push(spawnMobAt(ctx, def, [x, z], level, { noRespawn: true }));
  }
  ctx.scene.entity.floatText({
    instanceId: ctx.player.userId,
    text: `${config.name} — ${config.mobIds.length} hostiles`,
    kind: "info",
  });
}

function spawnCompanion(ctx: GameContext, session: ActiveDelve, userId: string): void {
  const owner = ctx.scene.entity.get(userId);
  if (owner === null) return;
  const x = owner.position[0] + 1.5;
  const z = owner.position[2] + 1.5;
  const id = ctx.scene.entity.spawn(COMPANION_CATALOG, {
    id: `companion:${userId}`,
    position: [x, ctx.world.groundHeightAt(x, z), z],
  });
  const level = levelForTier(session.def.baseLevel, session.tier, 0);
  const hp = 80 + level * 18;
  ctx.scene.entity.stats.set(id, "health", { max: hp, current: hp });
  ctx.scene.entity.stats.set(id, "level", { current: level });
  session.companionId = id;
}

function despawnCompanion(ctx: GameContext, session: ActiveDelve): void {
  if (session.companionId === null) return;
  if (ctx.scene.entity.get(session.companionId) !== null) {
    ctx.scene.entity.despawn(session.companionId);
  }
  session.companionId = null;
}

export function enterDelve(
  ctx: GameContext,
  userId: string,
  delveId: string,
  tier: DelveTier = "normal",
): boolean {
  const def = delveById(delveId);
  if (def === null) return false;
  if (active.has(userId)) exitDelve(ctx, userId);
  const hero = ctx.scene.entity.get(userId);
  if (hero === null) return false;
  const seed = `${delveId}:${tier}:${Math.floor(ctx.time.now() * 1000)}`;
  const sequence = buildChambers(def, tier, seed);
  sequence.start();
  const session: ActiveDelve = {
    def,
    tier,
    sequence,
    seed,
    spawned: [],
    companionId: null,
    returnPos: [hero.position[0], hero.position[2]],
  };
  active.set(userId, session);
  teleportHero(ctx, userId, def.center[0], def.center[1] - def.radius * 0.55);
  spawnCompanion(ctx, session, userId);
  spawnChamber(ctx, session);
  syncDelveStore(ctx, userId);
  return true;
}

export function advanceDelve(ctx: GameContext, userId: string): boolean {
  const session = active.get(userId);
  if (session === undefined) return false;
  if (session.sequence.status() !== "cleared") return false;
  if (!session.sequence.advance()) {
    syncDelveStore(ctx, userId);
    return true;
  }
  if (session.sequence.status() === "complete") {
    ctx.scene.entity.floatText({ instanceId: userId, text: `${session.def.name} cleared!`, kind: "info" });
    syncDelveStore(ctx, userId);
    return true;
  }
  spawnChamber(ctx, session);
  syncDelveStore(ctx, userId);
  return true;
}

export function exitDelve(ctx: GameContext, userId: string): boolean {
  const session = active.get(userId);
  if (session === undefined) return false;
  clearSpawned(ctx, session);
  despawnCompanion(ctx, session);
  const [x, z] = session.returnPos;
  teleportHero(ctx, userId, x, z);
  active.delete(userId);
  ctx.game.store.delete(`delve:${userId}`);
  return true;
}

export function tickDelve(ctx: GameContext, userId: string, dt: number): void {
  const session = active.get(userId);
  if (session === undefined) return;
  session.spawned = session.spawned.filter((id) => isMobInstance(id));
  if (session.sequence.status() === "playing" && session.spawned.length === 0) {
    session.sequence.clear();
    ctx.scene.entity.floatText({
      instanceId: userId,
      text: "Chamber cleared — advance when ready",
      kind: "info",
    });
  }
  tickCompanion(ctx, userId, session, dt);
  syncDelveStore(ctx, userId);
}

function tickCompanion(ctx: GameContext, userId: string, session: ActiveDelve, dt: number): void {
  const companionId = session.companionId;
  if (companionId === null) return;
  const companion = ctx.scene.entity.get(companionId);
  const owner = ctx.scene.entity.get(userId);
  if (companion === null || owner === null) {
    session.companionId = null;
    return;
  }
  const health = ctx.scene.entity.stats.get(companionId, "health");
  if (health !== null && health.current <= 0) {
    ctx.scene.entity.despawn(companionId);
    session.companionId = null;
    ctx.scene.entity.floatText({ instanceId: userId, text: "Companion fell!", kind: "info" });
    return;
  }
  let targetId: string | null = null;
  const ownerTarget = ctx.scene.entity.getTarget(userId);
  if (ownerTarget !== null && isMobInstance(ownerTarget)) targetId = ownerTarget;
  if (targetId === null) {
    const nearby = ctx.scene.entity.inRadius(companion.position, 14, isMobInstance);
    targetId = nearby[0] ?? null;
  }
  if (targetId !== null) {
    const dist = ctx.scene.entity.distance(companionId, targetId);
    if (dist !== null && dist > 2.4) {
      const next = ctx.scene.entity.moveToward(companionId, targetId, {
        speed: 6.5,
        dt,
        stopDistance: 2.2,
      });
      if (next !== null) {
        ctx.scene.entity.setPose(companionId, {
          position: [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]],
          rotationY: Math.atan2(next[0] - companion.position[0], next[2] - companion.position[2]),
          dt,
        });
      }
    } else if (dist !== null && dist <= 2.8) {
      const level = ctx.scene.entity.stats.get(companionId, "level")?.current ?? 5;
      const amount = 4 + level * 1.2;
      ctx.scene.entity.effect({
        from: companionId,
        to: targetId,
        effect: "damage",
        via: { amount: Math.round(amount) },
      });
    }
    return;
  }
  const followDist = Math.hypot(
    companion.position[0] - owner.position[0],
    companion.position[2] - owner.position[2],
  );
  if (followDist > 3.5) {
    const next = ctx.scene.entity.moveToward(companionId, userId, {
      speed: 7,
      dt,
      stopDistance: 2.5,
    });
    if (next !== null) {
      ctx.scene.entity.setPose(companionId, {
        position: [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]],
        dt,
      });
    }
  }
}

function syncDelveStore(ctx: GameContext, userId: string): void {
  const view = delveSessionOf(userId);
  if (view === null) {
    ctx.game.store.delete(`delve:${userId}`);
    return;
  }
  ctx.game.store.set(`delve:${userId}`, view);
}

export function placeDelveWorld(ctx: GameContext): void {
  for (const delve of DELVES) {
    const [x, z] = delve.entrance;
    ctx.scene.object.place("delve_portal", x, ctx.world.groundHeightAt(x, z), z);
  }
}

export const DELVE_PORTAL = "delve_portal";
export const DELVE_COMPANION_CATALOG = COMPANION_CATALOG;
