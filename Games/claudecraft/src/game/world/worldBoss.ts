import type { Drop } from "@jgengine/core/game/lootTable";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { mobById } from "../entities/enemies/catalog";
import { itemDefById } from "../items/catalog";
import type { DropDef } from "../model";
import { spawnMobAt } from "../ai/mobs";

export const WORLD_BOSS_MOB_ID = "thunzharr_waking_peak";

const STORMCRAG: readonly [number, number] = [40, 210];
const WORLD_BOSS_HP = 40000;
const RESPAWN_SEC = 240;
const LOCKOUT_SEC = 1800;

const lootRng = seededRng("claudecraft-worldboss");

let currentBossId: string | null = null;
let nextSpawnAt = 0;

export function isWorldBoss(instanceId: string): boolean {
  return currentBossId !== null && instanceId === currentBossId;
}

function lockKey(userId: string): string {
  return `worldboss:lock:${userId}`;
}

function announce(ctx: GameContext, text: string): void {
  const userId = ctx.player.userId;
  if (ctx.scene.entity.get(userId) === null) return;
  ctx.scene.entity.floatText({ instanceId: userId, text, kind: "info", scale: 1.4 });
}

function spawnThunzharr(ctx: GameContext): void {
  const def = mobById(WORLD_BOSS_MOB_ID);
  if (def === null) return;
  const id = spawnMobAt(ctx, def, STORMCRAG, def.maxLevel, { noRespawn: true });
  ctx.scene.entity.stats.set(id, "health", { max: WORLD_BOSS_HP, current: WORLD_BOSS_HP });
  currentBossId = id;
  announce(ctx, `${def.name} rises over Thornpeak Heights!`);
}

export function tickWorldBoss(ctx: GameContext): void {
  const now = ctx.time.now();
  if (currentBossId !== null) {
    if (ctx.scene.entity.get(currentBossId) === null) {
      currentBossId = null;
      nextSpawnAt = now + RESPAWN_SEC;
    }
    return;
  }
  if (now >= nextSpawnAt) spawnThunzharr(ctx);
}

function pickGroup(entries: readonly DropDef[], rng: () => number): string | null {
  const total = entries.reduce((sum, entry) => sum + entry.chance, 0);
  if (total <= 0 || rng() >= total) return null;
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.chance;
    if (roll <= 0 && entry.itemId !== undefined) return entry.itemId;
  }
  return entries[entries.length - 1]?.itemId ?? null;
}

export function rollWorldBossLoot(rng: () => number): Drop[] {
  const def = mobById(WORLD_BOSS_MOB_ID);
  if (def === null) return [];
  const drops: Drop[] = [];
  for (const entry of def.drops) {
    if (entry.itemId !== undefined && entry.chance >= 1) drops.push({ item: entry.itemId, count: 1 });
  }
  const gear = def.drops.filter((entry) => entry.itemId !== undefined && entry.chance < 1);
  const gloves = gear.filter((entry) => itemDefById(entry.itemId as string)?.slot === "gloves");
  const belts = gear.filter((entry) => itemDefById(entry.itemId as string)?.slot === "waist");
  const glove = pickGroup(gloves, rng);
  if (glove !== null) drops.push({ item: glove, count: 1 });
  else {
    const belt = pickGroup(belts, rng);
    if (belt !== null) drops.push({ item: belt, count: 1 });
  }
  return drops;
}

export function onWorldBossKilled(ctx: GameContext, instanceId: string, userId: string): void {
  if (currentBossId !== instanceId) return;
  currentBossId = null;
  const now = ctx.time.now();
  nextSpawnAt = now + RESPAWN_SEC;
  const expiry = (ctx.game.store.get(lockKey(userId)) as number | undefined) ?? 0;
  if (now < expiry) {
    announce(ctx, "You have already claimed Thunzharr's spoils this cycle.");
    return;
  }
  ctx.game.loot.grantToPlayer(userId, rollWorldBossLoot(lootRng), WORLD_BOSS_MOB_ID);
  ctx.game.store.set(lockKey(userId), now + LOCKOUT_SEC);
}

export function worldBossLockedOut(ctx: GameContext, userId: string): boolean {
  const expiry = (ctx.game.store.get(lockKey(userId)) as number | undefined) ?? 0;
  return ctx.time.now() < expiry;
}

export function resetWorldBoss(): void {
  currentBossId = null;
  nextSpawnAt = 0;
}
