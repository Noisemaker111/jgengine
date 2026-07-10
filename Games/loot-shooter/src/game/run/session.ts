import {
  advanceSpawnDirector,
  advanceWave,
  createSpawnDirectorState,
  type SpawnDirectorConfig,
  type SpawnDirectorState,
} from "@jgengine/core/ai/spawnDirector";
import type { NavPoint } from "@jgengine/core/nav/navGrid";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { AMMO_POOLS, AMMO_START, AMMO_STAT_IDS } from "../ammo";
import { enemyById } from "../entities/enemies/catalog";
import { player as playerDef } from "../entities/players/catalog";
import { STARTER_WEAPON_ID } from "../items/weapons/catalog";
import { xpRequiredForLevel } from "../progression/curves";
import { PLAYER_SPAWN } from "../world/setup";
import { INTERMISSION_SECONDS, MAX_ALIVE, WAVES, WAVE_CLEAR_BONUS, WAVE_COUNT } from "../waves/manifest";

export type RunStatus = "ready" | "wave" | "intermission" | "victory" | "defeat";

export interface RunSnapshot {
  status: RunStatus;
  wave: number;
  waveTotal: number;
  alive: number;
  intermissionLeft: number;
  kills: number;
  score: number;
  shotsFired: number;
  shotsHit: number;
  elapsed: number;
}

const SPAWN_RING_RADIUS = 30;
const SPAWN_RING_COUNT = 12;

export const SPAWN_RING: readonly NavPoint[] = Array.from({ length: SPAWN_RING_COUNT }, (_, i) => {
  const angle = (i / SPAWN_RING_COUNT) * Math.PI * 2;
  return [Math.cos(angle) * SPAWN_RING_RADIUS, Math.sin(angle) * SPAWN_RING_RADIUS] as NavPoint;
});

const DIRECTOR_CONFIG: SpawnDirectorConfig = {
  waves: WAVES,
  maxAlive: MAX_ALIVE,
  seed: 1337,
  spawnPoints: SPAWN_RING,
  spawnPointBias: -0.8,
};

function freshSnapshot(): RunSnapshot {
  return {
    status: "ready",
    wave: 1,
    waveTotal: WAVE_COUNT,
    alive: 0,
    intermissionLeft: 0,
    kills: 0,
    score: 0,
    shotsFired: 0,
    shotsHit: 0,
    elapsed: 0,
  };
}

export interface RunSession {
  snapshot(): RunSnapshot;
  status(): RunStatus;
  start(ctx: GameContext): void;
  tick(ctx: GameContext, dt: number): void;
  noteShot(hit: boolean): void;
  noteKill(ctx: GameContext, catalogId: string): void;
  noteDefeat(ctx: GameContext): void;
  selectedSlot(): number;
  selectSlot(ctx: GameContext, slot: number): void;
  rng(): number;
}

export function cheapestEntryCost(waveIndex: number): number {
  const manifest = WAVES[waveIndex];
  if (manifest === undefined) return Number.POSITIVE_INFINITY;
  return manifest.entries.reduce((min, entry) => Math.min(min, entry.cost), Number.POSITIVE_INFINITY);
}

export function aliveEnemyCount(ctx: GameContext): number {
  return ctx.scene.entity.list().filter((entity) => enemyById(entity.name) !== undefined).length;
}

export function createRunSession(): RunSession {
  let snapshot = freshSnapshot();
  let director: SpawnDirectorState = createSpawnDirectorState(DIRECTOR_CONFIG);
  let intermissionLeft = 0;
  let slot = 0;
  const roll = seededRng(20260710);

  function publish(ctx: GameContext): void {
    ctx.game.store.set("run", { ...snapshot });
  }

  function spawnFromDirector(ctx: GameContext, dt: number): void {
    const playerEntity = ctx.scene.entity.get(ctx.player.userId);
    const playerPositions: readonly NavPoint[] =
      playerEntity === null ? [] : [[playerEntity.position[0], playerEntity.position[2]]];
    const alive = aliveEnemyCount(ctx);
    const step = advanceSpawnDirector(DIRECTOR_CONFIG, director, dt, {
      alive,
      players: 1,
      playerPositions,
    });
    director = step.state;
    for (const request of step.spawns) {
      const point = request.point ?? SPAWN_RING[Math.floor(roll() * SPAWN_RING.length)]!;
      const jitterX = (roll() - 0.5) * 3;
      const jitterZ = (roll() - 0.5) * 3;
      ctx.scene.entity.spawn(request.entryId, {
        position: [point[0] + jitterX, 0, point[1] + jitterZ],
        role: "npc",
      });
    }
  }

  function clearField(ctx: GameContext): void {
    for (const entity of ctx.scene.entity.list()) {
      if (enemyById(entity.name) !== undefined) ctx.scene.entity.despawn(entity.id);
    }
    for (const record of ctx.scene.worldItem.list()) ctx.scene.worldItem.consume(record.instanceId);
  }

  function resetPlayer(ctx: GameContext): void {
    const userId = ctx.player.userId;
    const baseHealth = playerDef.stats.health?.max ?? 100;
    ctx.scene.entity.stats.set(userId, "health", { max: baseHealth, current: baseHealth });
    ctx.scene.entity.stats.set(userId, "xp", { current: 0, max: xpRequiredForLevel(1) });
    ctx.scene.entity.stats.set(userId, "level", { current: 1 });
    for (const pool of AMMO_POOLS) {
      const seed = AMMO_START[pool];
      ctx.scene.entity.stats.set(userId, AMMO_STAT_IDS[pool], { max: seed.max, current: seed.current });
    }
    for (const inventoryId of ["hotbar", "backpack"]) {
      const state = ctx.player.inventory.state(inventoryId);
      for (const stack of state.slots) {
        if (stack !== null) ctx.player.inventory.take(inventoryId, stack.itemId, stack.count);
      }
    }
    ctx.player.applyLoadout(userId, "starterKit");
    ctx.scene.entity.resetToSpawn(userId);
  }

  return {
    snapshot: () => snapshot,
    status: () => snapshot.status,

    start(ctx) {
      clearField(ctx);
      if (ctx.scene.entity.get(ctx.player.userId) === null) {
        ctx.scene.entity.spawn(playerDef.id, {
          id: ctx.player.userId,
          position: PLAYER_SPAWN,
          role: "player",
        });
      }
      resetPlayer(ctx);
      director = createSpawnDirectorState(DIRECTOR_CONFIG);
      snapshot = freshSnapshot();
      snapshot.status = "wave";
      slot = 0;
      ctx.game.store.set("selectedSlot", 0);
      publish(ctx);
    },

    tick(ctx, dt) {
      if (snapshot.status !== "wave" && snapshot.status !== "intermission") return;
      snapshot.elapsed += dt;

      if (snapshot.status === "intermission") {
        intermissionLeft -= dt;
        snapshot.intermissionLeft = Math.max(0, intermissionLeft);
        if (intermissionLeft <= 0) {
          director = advanceWave(DIRECTOR_CONFIG, director);
          snapshot.status = "wave";
          snapshot.wave = director.wave + 1;
          snapshot.intermissionLeft = 0;
        }
        publish(ctx);
        return;
      }

      spawnFromDirector(ctx, dt);
      const alive = aliveEnemyCount(ctx);
      snapshot.alive = alive;

      const exhausted = director.budget < cheapestEntryCost(director.wave);
      if (exhausted && alive === 0 && director.spawnedThisWave > 0) {
        snapshot.score += WAVE_CLEAR_BONUS * (director.wave + 1);
        if (director.wave >= WAVE_COUNT - 1) {
          snapshot.status = "victory";
        } else {
          snapshot.status = "intermission";
          intermissionLeft = INTERMISSION_SECONDS;
          snapshot.intermissionLeft = INTERMISSION_SECONDS;
          snapshot.wave = director.wave + 2;
        }
      }
      publish(ctx);
    },

    noteShot(hit) {
      snapshot.shotsFired += 1;
      if (hit) snapshot.shotsHit += 1;
    },

    noteKill(ctx, catalogId) {
      const enemy = enemyById(catalogId);
      if (enemy === undefined) return;
      snapshot.kills += 1;
      snapshot.score += enemy.score;
      publish(ctx);
    },

    noteDefeat(ctx) {
      if (snapshot.status === "defeat") return;
      snapshot.status = "defeat";
      publish(ctx);
    },

    selectedSlot: () => slot,

    selectSlot(ctx, next) {
      slot = next;
      ctx.game.store.set("selectedSlot", next);
    },

    rng: () => roll(),
  };
}

export const session: RunSession = createRunSession();
