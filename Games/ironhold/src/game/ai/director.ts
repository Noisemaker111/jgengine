import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { advanceSpawnDirector } from "@jgengine/core/ai/spawnDirector";

import { combatantDef } from "../catalog";
import { ENEMY_WAVE_INTERVAL, ENEMY_WAVE_MAX_FIELDED } from "../tuning";
import { playerKeepPoint } from "../world/scene";
import { livingUnits, session, type UnitRuntime } from "../session";
import { ENEMY_WAVE_DIRECTOR_CONFIG } from "./waveManifest";

/**
 * The Marauder war-effort. A living Warcamp musters escalating reinforcement waves on the shared
 * spawn-director clock; each wave attack-moves the player keep, auto-acquiring anything it passes.
 * The director owns the cadence (one wave token per interval); composition (`waveComposition`) and
 * the formation fan (`spawnWave`) stay game-side, and the opening grace / fielded cap freeze the
 * clock rather than advance it — no per-frame world scan beyond the roster.
 */

/** The wave-th group's composition: grunts scale up, heavier Reavers join the later waves. */
export function waveComposition(wave: number): string[] {
  const grunts = Math.min(2 + Math.floor(wave * 0.75), 6);
  const reavers = Math.min(Math.floor(wave / 3), 3);
  const out: string[] = [];
  for (let i = 0; i < grunts; i += 1) out.push("grunt");
  for (let i = 0; i < reavers; i += 1) out.push("reaver");
  return out;
}

/** Where waves march: the live player keep if it still stands, else the authored keep point. */
function assaultTarget(): { x: number; z: number } {
  const keep = livingUnits("player", "building").find((u) => u.catalogId === "keep_player");
  if (keep?.guardPoint !== undefined) return keep.guardPoint;
  return playerKeepPoint();
}

/** Muster one wave in front of the Warcamp, fanned toward the player keep, and send it in. */
function spawnWave(ctx: GameContext, camp: SceneEntity, wave: number): void {
  const target = assaultTarget();
  const dx = target.x - camp.position[0];
  const dz = target.z - camp.position[2];
  const len = Math.hypot(dx, dz) || 1;
  const fx = dx / len; // forward, toward the player
  const fz = dz / len;
  const px = -fz; // perpendicular, for lateral spread
  const pz = fx;

  const comp = waveComposition(wave);
  for (let i = 0; i < comp.length; i += 1) {
    const catalogId = comp[i]!;
    session.trainSeq += 1;
    const id = `${catalogId}_w${wave}s${session.trainSeq}`;
    const lane = ((i % 5) - 2) * 1.9;
    const rank = Math.floor(i / 5) * 2;
    const ex = camp.position[0] + fx * (6 + rank) + px * lane;
    const ez = camp.position[2] + fz * (6 + rank) + pz * lane;
    ctx.scene.entity.spawn(catalogId, { id, position: [ex, 0, ez], role: "npc" });
    const unit: UnitRuntime = {
      id,
      catalogId,
      faction: "enemy",
      kind: "unit",
      command: { kind: "attackMove", x: target.x, z: target.z },
      leash: 0,
      attackCooldown: 0,
    };
    session.units.set(id, unit);
  }
}

/** Seconds until the next wave musters, for the HUD countdown. Grace first, then the director beat. */
export function nextWaveEta(): number {
  const wave = session.enemyWave;
  if (wave.grace > 0) return wave.grace;
  return Math.max(0, ENEMY_WAVE_INTERVAL - wave.director.waveElapsed);
}

/** Advance the enemy reinforcement clock; muster a wave when the director emits a token. */
export function tickEnemyWaves(ctx: GameContext, dt: number): void {
  if (session.over) return;
  const wave = session.enemyWave;

  // Opening grace: nothing musters for the first ENEMY_WAVE_FIRST_DELAY seconds. The director clock
  // is frozen (never advanced) until grace elapses, so its first token lands right after.
  if (wave.grace > 0) {
    wave.grace -= dt;
    return;
  }

  // No Warcamp → no reinforcements. Freezing (returning) means razing it stems the tide for good:
  // the camp cannot respawn to resume the cadence.
  const camp = livingUnits("enemy", "building").find((u) => combatantDef(u.catalogId)?.id === "keep_enemy");
  const campEnt = camp === undefined ? null : ctx.scene.entity.get(camp.id);
  if (campEnt === null) return;

  // Bounded pressure: while the field is already crowded, freeze the clock rather than pile on. It
  // resumes the instant the roster thins, so held waves never accumulate into a dump.
  const alive = livingUnits("enemy", "unit").length;
  if (alive >= ENEMY_WAVE_MAX_FIELDED) return;

  // Advance the shared spawn director; each emitted token is one escalating wave, expanded game-side.
  const step = advanceSpawnDirector(ENEMY_WAVE_DIRECTOR_CONFIG, wave.director, dt, { alive });
  wave.director = step.state;
  for (let i = 0; i < step.spawns.length; i += 1) {
    wave.sent += 1;
    spawnWave(ctx, campEnt, wave.sent);
  }
}
