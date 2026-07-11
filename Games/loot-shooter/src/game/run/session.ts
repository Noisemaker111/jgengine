import {
  advanceSpawnDirector,
  advanceWave,
  createSpawnDirectorState,
  type SpawnDirectorConfig,
  type SpawnDirectorState,
  type WaveManifest,
} from "@jgengine/core/ai/spawnDirector";
import { setPlayControlsActive } from "@jgengine/core/game/controlGate";
import { createRecordBook, type RecordBook } from "@jgengine/core/game/recordBook";
import type { NavPoint } from "@jgengine/core/nav/navGrid";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { AMMO_POOLS, AMMO_START, AMMO_STAT_IDS } from "../ammo";
import { SOUND_IDS } from "../audio/catalog";
import { resetAiState } from "../entities/enemies/ai";
import { enemyById } from "../entities/enemies/catalog";
import { player as playerDef } from "../entities/players/catalog";
import { resetWeaponState } from "../items/use-handlers";
import { xpRequiredForLevel } from "../progression/curves";
import { CHALLENGE_IDS, challenges } from "../quests/catalog";
import { PLAYER_SPAWN } from "../world/setup";
import { ENEMY_COSTS, INTERMISSION_SECONDS, MAX_ALIVE, WAVES, WAVE_CLEAR_BONUS, WAVE_COUNT } from "../waves/manifest";

export type RunStatus = "ready" | "wave" | "intermission" | "victory" | "defeat";

export interface RunSnapshot {
  status: RunStatus;
  wave: number;
  waveTotal: number;
  endless: boolean;
  alive: number;
  intermissionLeft: number;
  kills: number;
  score: number;
  shotsFired: number;
  shotsHit: number;
  elapsed: number;
}

export type RecordField = "score" | "wave" | "accuracy";

const SPAWN_RING_RADIUS = 30;
const SPAWN_RING_COUNT = 12;

export const SPAWN_RING: readonly NavPoint[] = Array.from({ length: SPAWN_RING_COUNT }, (_, i) => {
  const angle = (i / SPAWN_RING_COUNT) * Math.PI * 2;
  return [Math.cos(angle) * SPAWN_RING_RADIUS, Math.sin(angle) * SPAWN_RING_RADIUS] as NavPoint;
});

function directorConfig(waves: readonly WaveManifest[], seed: number, maxAlive: number): SpawnDirectorConfig {
  return { waves, maxAlive, seed, spawnPoints: SPAWN_RING, spawnPointBias: -0.8 };
}

const CAMPAIGN_CONFIG = directorConfig(WAVES, 1337, MAX_ALIVE);

export function endlessManifest(waveNumber: number): WaveManifest {
  const budget = Math.round(700 * 1.16 ** (waveNumber - WAVE_COUNT));
  const entries = [
    { id: "drone_elite", cost: ENEMY_COSTS.drone_elite!, weight: 24 },
    { id: "skitter_elite", cost: ENEMY_COSTS.skitter_elite!, weight: 20 },
    { id: "spitter_elite", cost: ENEMY_COSTS.spitter_elite!, weight: 20 },
    { id: "husk_elite", cost: ENEMY_COSTS.husk_elite!, weight: 18 },
    { id: "husk_veteran", cost: ENEMY_COSTS.husk_veteran!, weight: 14 },
  ];
  if (waveNumber % 5 === 0) {
    entries.unshift({ id: "boss_warden", cost: ENEMY_COSTS.boss_warden!, weight: 100 });
  }
  return { budget, entries };
}

function freshSnapshot(): RunSnapshot {
  return {
    status: "ready",
    wave: 1,
    waveTotal: WAVE_COUNT,
    endless: false,
    alive: 0,
    intermissionLeft: 0,
    kills: 0,
    score: 0,
    shotsFired: 0,
    shotsHit: 0,
    elapsed: 0,
  };
}

export function accuracyPercent(snapshot: RunSnapshot): number {
  return snapshot.shotsFired === 0 ? 0 : Math.round((snapshot.shotsHit / snapshot.shotsFired) * 100);
}

function safeStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export interface RunSession {
  snapshot(): RunSnapshot;
  status(): RunStatus;
  records(): RecordBook<RecordField>;
  start(ctx: GameContext): void;
  enterEndless(ctx: GameContext): void;
  tick(ctx: GameContext, dt: number): void;
  noteShot(hit: boolean): void;
  noteKill(ctx: GameContext, catalogId: string): void;
  noteDefeat(ctx: GameContext): void;
  selectedSlot(): number;
  selectSlot(ctx: GameContext, slot: number): void;
  rng(): number;
}

export function cheapestCostOf(config: SpawnDirectorConfig, waveIndex: number): number {
  const manifest = config.waves[waveIndex];
  if (manifest === undefined) return Number.POSITIVE_INFINITY;
  return manifest.entries.reduce((min, entry) => Math.min(min, entry.cost), Number.POSITIVE_INFINITY);
}

export function aliveEnemyCount(ctx: GameContext): number {
  return ctx.scene.entity.list().filter((entity) => enemyById(entity.name) !== undefined).length;
}

export function createRunSession(): RunSession {
  let snapshot = freshSnapshot();
  let config = CAMPAIGN_CONFIG;
  let director: SpawnDirectorState = createSpawnDirectorState(config);
  let intermissionLeft = 0;
  let slot = 0;
  const roll = seededRng(20260710);
  const records = createRecordBook<RecordField>({
    key: "loot-shooter-records",
    fields: { score: "higher", wave: "higher", accuracy: "higher" },
    storage: safeStorage(),
  });

  function publish(ctx: GameContext): void {
    ctx.game.store.set("run", { ...snapshot });
    setPlayControlsActive(ctx, snapshot.status === "wave" || snapshot.status === "intermission");
  }

  function publishRecords(ctx: GameContext): void {
    ctx.game.store.set("records", { ...records.best() });
  }

  function noteWaveStarted(ctx: GameContext): void {
    ctx.game.quest.progress(ctx.player.userId, CHALLENGE_IDS.midfield, "wave", 1);
  }

  function submitRecords(ctx: GameContext): void {
    const improved = records.submit({
      score: snapshot.score,
      wave: snapshot.wave,
      accuracy: accuracyPercent(snapshot),
    });
    publishRecords(ctx);
    if (improved.improved.includes("score")) {
      ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "NEW BEST SCORE", kind: "pickup" });
    }
  }

  function spawnFromDirector(ctx: GameContext, dt: number): void {
    const playerEntity = ctx.scene.entity.get(ctx.player.userId);
    const playerPositions: readonly NavPoint[] =
      playerEntity === null ? [] : [[playerEntity.position[0], playerEntity.position[2]]];
    const alive = aliveEnemyCount(ctx);
    const step = advanceSpawnDirector(config, director, dt, { alive, players: 1, playerPositions });
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

  function resetChallenges(ctx: GameContext): void {
    const userId = ctx.player.userId;
    for (const challenge of challenges) {
      ctx.game.quest.revoke(userId, challenge.id);
      ctx.game.quest.grant(userId, challenge.id);
    }
  }

  function beginWaveClearBookkeeping(ctx: GameContext): void {
    const alive = aliveEnemyCount(ctx);
    snapshot.alive = alive;

    const exhausted = director.budget < cheapestCostOf(config, director.wave);
    if (!(exhausted && alive === 0 && director.spawnedThisWave > 0)) {
      publish(ctx);
      return;
    }

    snapshot.score += WAVE_CLEAR_BONUS * snapshot.wave;
    const lastCampaignWave = !snapshot.endless && director.wave >= WAVE_COUNT - 1;
    if (lastCampaignWave) {
      snapshot.status = "victory";
      ctx.game.events.emit("audio.play", { sound: SOUND_IDS.victory });
      submitRecords(ctx);
    } else {
      snapshot.status = "intermission";
      intermissionLeft = INTERMISSION_SECONDS;
      snapshot.intermissionLeft = INTERMISSION_SECONDS;
      snapshot.wave += 1;
    }
    publish(ctx);
  }

  return {
    snapshot: () => snapshot,
    status: () => snapshot.status,
    records: () => records,

    start(ctx) {
      clearField(ctx);
      resetAiState();
      resetWeaponState();
      if (ctx.scene.entity.get(ctx.player.userId) === null) {
        ctx.scene.entity.spawn(playerDef.id, {
          id: ctx.player.userId,
          position: PLAYER_SPAWN,
          role: "player",
        });
      }
      resetPlayer(ctx);
      resetChallenges(ctx);
      config = CAMPAIGN_CONFIG;
      director = createSpawnDirectorState(config);
      snapshot = freshSnapshot();
      snapshot.status = "wave";
      slot = 0;
      ctx.game.store.set("selectedSlot", 0);
      ctx.game.events.emit("audio.play", { sound: SOUND_IDS.waveHorn });
      noteWaveStarted(ctx);
      publishRecords(ctx);
      publish(ctx);
    },

    enterEndless(ctx) {
      if (snapshot.status !== "victory") return;
      snapshot.endless = true;
      snapshot.status = "intermission";
      intermissionLeft = INTERMISSION_SECONDS;
      snapshot.intermissionLeft = INTERMISSION_SECONDS;
      snapshot.wave += 1;
      publish(ctx);
    },

    tick(ctx, dt) {
      if (snapshot.status !== "wave" && snapshot.status !== "intermission") return;
      snapshot.elapsed += dt;

      if (snapshot.status === "intermission") {
        intermissionLeft -= dt;
        snapshot.intermissionLeft = Math.max(0, intermissionLeft);
        if (intermissionLeft <= 0) {
          if (snapshot.endless && snapshot.wave > WAVE_COUNT) {
            config = directorConfig([endlessManifest(snapshot.wave)], 1337 + snapshot.wave, MAX_ALIVE + 4);
            director = createSpawnDirectorState(config);
          } else {
            director = advanceWave(config, director);
          }
          snapshot.status = "wave";
          snapshot.intermissionLeft = 0;
          ctx.game.events.emit("audio.play", { sound: SOUND_IDS.waveHorn });
          noteWaveStarted(ctx);
        }
        publish(ctx);
        return;
      }

      spawnFromDirector(ctx, dt);
      beginWaveClearBookkeeping(ctx);
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
      const userId = ctx.player.userId;
      if (enemy.rank === "elite") ctx.game.quest.progress(userId, CHALLENGE_IDS.eliteHunter, "kills", 1);
      if (enemy.rank === "boss") ctx.game.quest.progress(userId, CHALLENGE_IDS.bossSlayer, "kills", 1);
      publish(ctx);
    },

    noteDefeat(ctx) {
      if (snapshot.status === "defeat") return;
      snapshot.status = "defeat";
      ctx.game.events.emit("audio.play", { sound: SOUND_IDS.defeat });
      submitRecords(ctx);
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
