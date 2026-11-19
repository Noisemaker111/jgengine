import { createDamageRuntime, type DamageRuntime } from "@jgengine/core/combat/damage/damageRuntime";
import type { DamageTableDef } from "@jgengine/core/combat/damage/damageTable";
import type { HitZoneTable } from "@jgengine/core/combat/hitZones";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { combatantDef } from "./catalog";

export const MATCHUPS: DamageTableDef = {
  types: [
    { id: "strike" },
    { id: "blade", vs: { heavy: 1.5 } },
    { id: "siege", vs: { building: 2, keep: 2 } },
    { id: "rifle", vs: { heavy: 0.55, keep: 1.35 } },
  ],
};

/**
 * Range bands as hit zones. A blow struck from inside its attacker's `crowdedWithin` lands
 * `crowded`: a rifle needs a screen, and closing on it is counterplay even after weapon research.
 * No band crits, so the zone never draws from a random stream.
 */
export const RANGE_BANDS: HitZoneTable = {
  zones: [{ id: "clear" }, { id: "crowded", multiplier: 0.45 }],
  defaultZone: "clear",
};

export function createMatchups(): DamageRuntime {
  return createDamageRuntime({ table: MATCHUPS, zones: RANGE_BANDS, rng: () => 0 });
}

const matchupsOf = perContext((_ctx: GameContext): DamageRuntime => createMatchups());

export function matchups(ctx: GameContext): DamageRuntime {
  return matchupsOf(ctx);
}

export interface Combatant {
  id: string;
  catalogId: string;
}

export function matchupDamage(runtime: DamageRuntime, base: number, attacker: Combatant, target: Combatant, distance: number): number {
  const from = combatantDef(attacker.catalogId);
  // A body's class follows its roster entry; ids are reused across battles, so the profile is set per blow.
  runtime.registerTarget(target.id, { resistance: combatantDef(target.catalogId)?.resistance ?? "unit" });
  const crowded = distance < (from?.crowdedWithin ?? 0);
  return runtime.hit({
    target: target.id,
    type: from?.damageType ?? "strike",
    base,
    zone: crowded ? "crowded" : "clear",
    source: attacker.id,
  }).damage;
}

export function forgetCombatant(ctx: GameContext, id: string): void {
  matchupsOf(ctx).removeTarget(id);
}
