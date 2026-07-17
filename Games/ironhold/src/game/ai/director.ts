import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { combatantDef } from "../catalog";
import { ENEMY_WAVE_INTERVAL, ENEMY_WAVE_MAX_FIELDED, ENEMY_WAVE_RECHECK } from "../tuning";
import { playerKeepPoint } from "../world/scene";
import { livingUnits, session, type UnitRuntime } from "../session";

/**
 * The Marauder war-effort. A living Warcamp musters escalating reinforcement waves on a timer; each
 * wave attack-moves the player keep, auto-acquiring anything it passes. Escalation, cadence, and the
 * fielded cap all live on the serializable `session.enemyWave` clock — no per-frame world scan.
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

/** Advance the enemy reinforcement clock; muster a wave when it comes due. Bounded by the roster. */
export function tickEnemyWaves(ctx: GameContext, dt: number): void {
  if (session.over) return;
  const wave = session.enemyWave;
  wave.timer -= dt;
  if (wave.timer > 0) return;

  // No Warcamp → no reinforcements. Razing it is how the player stems the tide.
  const camp = livingUnits("enemy", "building").find((u) => combatantDef(u.catalogId)?.id === "keep_enemy");
  const campEnt = camp === undefined ? null : ctx.scene.entity.get(camp.id);
  if (campEnt === null) return;

  // Bounded pressure: hold the wave while the field is already crowded, then recheck soon.
  if (livingUnits("enemy", "unit").length >= ENEMY_WAVE_MAX_FIELDED) {
    wave.timer = ENEMY_WAVE_RECHECK;
    return;
  }

  wave.sent += 1;
  spawnWave(ctx, campEnt, wave.sent);
  wave.timer = ENEMY_WAVE_INTERVAL;
}
