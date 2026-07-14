import {
  advanceSpawnDirector,
  createSpawnDirectorState,
  type SpawnDirectorConfig,
  type SpawnDirectorState,
} from "@jgengine/core/ai/spawnDirector";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { despawnMob, isMobInstance, spawnMobAt } from "../ai/mobs";
import { mobById } from "../entities/enemies/catalog";
import { teleportHero } from "../session/hero";
import { yumiStore } from "../session/stores";

export const YUMI_ENTRANCE: readonly [number, number] = [48, -310];
export const YUMI_ARENA: readonly [number, number] = [80, -340];
export const YUMI_SHRINE = "yumi_shrine";
export const YUMI_CATALOG = "yumi_cat";
export const YUMI_MAX_HP = 5000;

export interface YumiView {
  active: boolean;
  yumiHp: number;
  yumiMaxHp: number;
  wave: number;
  alive: number;
  status: "playing" | "won" | "lost";
}

interface YumiSession {
  yumiId: string;
  director: SpawnDirectorState;
  config: SpawnDirectorConfig;
  spawned: string[];
  returnPos: readonly [number, number];
  status: "playing" | "won" | "lost";
  teleportAt: number;
}

const sessions = new Map<string, YumiSession>();

const WAVE_CONFIG: SpawnDirectorConfig = {
  waves: [
    {
      budget: 6,
      entries: [
        { id: "forest_wolf", cost: 2, weight: 2 },
        { id: "wild_boar", cost: 2, weight: 1 },
      ],
      duration: 20,
    },
    {
      budget: 10,
      entries: [
        { id: "forest_wolf", cost: 2, weight: 1 },
        { id: "vale_bandit", cost: 3, weight: 2 },
        { id: "webwood_spider", cost: 2, weight: 1 },
      ],
      duration: 25,
    },
    {
      budget: 14,
      entries: [
        { id: "vale_bandit", cost: 3, weight: 2 },
        { id: "webwood_spider", cost: 2, weight: 1 },
      ],
      duration: 30,
    },
  ],
  maxAlive: 8,
  maxSpawnsPerTick: 2,
  loop: false,
  seed: 4242,
  spawnPoints: [
    [70, -330],
    [90, -330],
    [70, -350],
    [90, -350],
  ],
};

export function placeYumiShrine(ctx: GameContext): void {
  const [x, z] = YUMI_ENTRANCE;
  ctx.scene.object.place(YUMI_SHRINE, x, ctx.world.groundHeightAt(x, z), z);
}

export function startProtectYumi(ctx: GameContext, userId: string): boolean {
  if (sessions.has(userId)) return false;
  const hero = ctx.scene.entity.get(userId);
  if (hero === null) return false;
  const [ax, az] = YUMI_ARENA;
  const yumiId = ctx.scene.entity.spawn(YUMI_CATALOG, {
    id: `yumi:${userId}`,
    position: [ax, ctx.world.groundHeightAt(ax, az), az],
  });
  ctx.scene.entity.stats.set(yumiId, "health", { max: YUMI_MAX_HP, current: YUMI_MAX_HP });
  ctx.scene.entity.stats.set(yumiId, "level", { current: 1 });
  const session: YumiSession = {
    yumiId,
    director: createSpawnDirectorState(WAVE_CONFIG),
    config: WAVE_CONFIG,
    spawned: [],
    returnPos: [hero.position[0], hero.position[2]],
    status: "playing",
    teleportAt: ctx.time.now() + 12,
  };
  sessions.set(userId, session);
  teleportHero(ctx, userId, ax - 4, az + 4);
  sync(ctx, userId);
  ctx.scene.entity.floatText({
    instanceId: userId,
    text: "Protect Yumi! Keep the cat safe.",
    kind: "info",
  });
  return true;
}

export function leaveProtectYumi(ctx: GameContext, userId: string): boolean {
  const session = sessions.get(userId);
  if (session === undefined) return false;
  cleanup(ctx, session);
  teleportHero(ctx, userId, session.returnPos[0], session.returnPos[1]);
  sessions.delete(userId);
  yumiStore.clear(ctx, userId);
  return true;
}

function cleanup(ctx: GameContext, session: YumiSession): void {
  for (const id of session.spawned) despawnMob(ctx, id);
  session.spawned = [];
  if (ctx.scene.entity.get(session.yumiId) !== null) ctx.scene.entity.despawn(session.yumiId);
}

export function tickProtectYumi(ctx: GameContext, userId: string, dt: number): void {
  const session = sessions.get(userId);
  if (session === undefined || session.status !== "playing") return;

  const yumi = ctx.scene.entity.get(session.yumiId);
  if (yumi === null) {
    session.status = "lost";
    sync(ctx, userId);
    return;
  }

  const yumiHp = ctx.scene.entity.stats.get(session.yumiId, "health");
  if (yumiHp !== null && yumiHp.current <= 0) {
    session.status = "lost";
    ctx.scene.entity.floatText({ instanceId: userId, text: "Yumi fell! Defense failed.", kind: "info" });
    sync(ctx, userId);
    return;
  }

  if (ctx.time.now() >= session.teleportAt) {
    session.teleportAt = ctx.time.now() + 10 + Math.random() * 6;
    const angle = Math.random() * Math.PI * 2;
    const radius = 4 + Math.random() * 8;
    const [ax, az] = YUMI_ARENA;
    const nx = ax + Math.cos(angle) * radius;
    const nz = az + Math.sin(angle) * radius;
    ctx.scene.entity.setPose(session.yumiId, {
      position: [nx, ctx.world.groundHeightAt(nx, nz), nz],
    });
    ctx.scene.entity.floatText({ instanceId: session.yumiId, text: "Yumi dashes!", kind: "info" });
  }

  session.spawned = session.spawned.filter((id) => isMobInstance(id));
  const step = advanceSpawnDirector(session.config, session.director, dt, {
    alive: session.spawned.length,
    players: 1,
    playerPositions: [[yumi.position[0], yumi.position[2]]],
  });
  session.director = step.state;
  for (const spawn of step.spawns) {
    const def = mobById(spawn.entryId);
    if (def === null) continue;
    const px = spawn.point?.[0] ?? YUMI_ARENA[0] + (Math.random() - 0.5) * 16;
    const pz = spawn.point?.[1] ?? YUMI_ARENA[1] + (Math.random() - 0.5) * 16;
    const id = spawnMobAt(ctx, def, [px, pz], Math.max(def.minLevel, 3), { noRespawn: true });
    session.spawned.push(id);
  }

  for (const mobId of session.spawned) {
    const mob = ctx.scene.entity.get(mobId);
    if (mob === null) continue;
    const dist = Math.hypot(mob.position[0] - yumi.position[0], mob.position[2] - yumi.position[2]);
    if (dist < 2.8) {
      ctx.scene.entity.effect({
        from: mobId,
        to: session.yumiId,
        effect: "damage",
        via: { amount: 8 },
      });
    } else {
      const next = ctx.scene.entity.moveToward(mobId, session.yumiId, {
        speed: 5.5,
        dt,
        stopDistance: 2.4,
      });
      if (next !== null) {
        ctx.scene.entity.setPose(mobId, {
          position: [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]],
          dt,
        });
      }
    }
  }

  if (session.director.done && session.spawned.length === 0) {
    session.status = "won";
    ctx.scene.entity.floatText({ instanceId: userId, text: "Yumi is safe! Victory.", kind: "info" });
  }
  sync(ctx, userId);
}

function sync(ctx: GameContext, userId: string): void {
  const session = sessions.get(userId);
  if (session === undefined) {
    yumiStore.clear(ctx, userId);
    return;
  }
  const hp = ctx.scene.entity.stats.get(session.yumiId, "health");
  const view: YumiView = {
    active: true,
    yumiHp: hp?.current ?? 0,
    yumiMaxHp: hp?.max ?? YUMI_MAX_HP,
    wave: session.director.wave + 1,
    alive: session.spawned.filter((id) => isMobInstance(id)).length,
    status: session.status,
  };
  yumiStore.write(ctx, userId, view);
}

export function yumiActive(userId: string): boolean {
  return sessions.has(userId);
}
