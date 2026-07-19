import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { selectAutoTarget } from "@jgengine/core/scene/autoTarget";
import { advancePursuit, armPursuit } from "@jgengine/core/ai/pursuit";

import { combatantDef, isHostile } from "../catalog";
import { session, type UnitRuntime } from "../session";
import { resolveDamage } from "../upgrades";

function distXZ(a: EntityPosition, b: EntityPosition): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/**
 * Nearest hostile within `range` for a Guard Tower, resolved through the shared auto-target policy.
 * Candidates are the living hostiles in range (roster-bounded, no whole-world scan); `selectAutoTarget`
 * owns the "nearest" pick so towers, units, and future emplacements share one selection seam.
 */
function chooseTarget(ctx: GameContext, tower: UnitRuntime, towerPos: EntityPosition, range: number): string | null {
  const inRange: { id: string; dist: number }[] = [];
  for (const other of session.units.values()) {
    if (!isHostile(tower.faction, other.faction)) continue;
    const ent = ctx.scene.entity.get(other.id);
    if (ent === null) continue;
    const dist = distXZ(towerPos, ent.position);
    if (dist <= range) inRange.push({ id: other.id, dist });
  }
  if (inRange.length === 0) return null;
  const byId = new Map(inRange.map((c) => [c.id, c.dist]));
  return selectAutoTarget("nearest", tower.id, {
    candidates: () => inRange.map((c) => c.id),
    distance: (_from, toId) => byId.get(toId) ?? null,
  });
}

/**
 * Guard Towers auto-fire at the nearest hostile in range. A stationary emplacement is the degenerate
 * pursuit case — no chase, no leash — so `advancePursuit` runs with an infinite `stopDistance` (an
 * acquired target is always "in reach") and owns the per-tower attack cooldown; `armPursuit` re-arms
 * it after each shot. The `resolveDamage` faction modifier stays game-side. Roster-bounded per frame.
 */
export function tickTowers(ctx: GameContext, dt: number): void {
  if (session.over) return;
  for (const u of session.units.values()) {
    if (u.kind !== "building") continue;
    const def = combatantDef(u.catalogId);
    if (def === null || def.damage <= 0) continue; // only armed structures
    const self = ctx.scene.entity.get(u.id);
    if (self === null) continue;

    const targetId = chooseTarget(ctx, u, self.position, def.attackRange);
    // `u` is its own PursuitState (it carries `attackCooldown`); the cooldown ticks every frame
    // ("always"), and a target that exists is always in reach (stopDistance = +Infinity).
    const action = advancePursuit(u, dt, targetId === null ? null : 0, Number.POSITIVE_INFINITY, "always");
    if (action !== "attack" || targetId === null) continue;

    const defender = session.units.get(targetId)?.faction ?? "enemy";
    const amount = resolveDamage(def.damage, u.faction, defender);
    ctx.scene.entity.effect({ from: u.id, to: targetId, effect: "damage", via: { amount } });
    armPursuit(u, def.attackCooldown);
  }
}
