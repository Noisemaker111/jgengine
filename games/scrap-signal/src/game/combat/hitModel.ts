import { createDamageRuntime, type DamageRuntime, type DamageRuntimeState } from "@jgengine/core/combat/damageRuntime";
import type { DamageTableDef } from "@jgengine/core/combat/damageTable";
import type { HitZoneTable } from "@jgengine/core/combat/hitZones";
import type { StatusDef } from "@jgengine/core/combat/statusRuntime";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { bonus } from "../characters";
import { enemyById } from "../entities/enemies/catalog";
import { surfaceOverride } from "./surfaceOverride";
import type { GunDef, GunElement, Surface } from "../handroll/guns";

/**
 * Scrap's elemental chart, as data the shared damage model reads. The old local `ELEMENT_MATCHUP`
 * table is the same numbers, moved into the shape `combat/damageRuntime` consumes: a damage type per
 * gun element scored against the three resistance classes a body here can present. A target with a
 * live shield presents `shield` and ignores its hull surface, which is the precedence the old
 * shielded-overrides-surface check encoded.
 */
export const DAMAGE_TABLE: DamageTableDef = {
  types: [
    { id: "none" },
    { id: "incendiary", vs: { flesh: 1.5, armor: 0.75, shield: 0.75 } },
    { id: "corrosive", vs: { flesh: 0.9, armor: 1.5, shield: 0.75 } },
    { id: "shock", vs: { shield: 2 } },
    { id: "flux", vs: { shield: 0.75 } },
    { id: "explosive" },
  ],
  defaultMultiplier: 1,
};

/** The flux debuff: a pure marker status. While carried, every non-flux channel is doubled. */
export const FLUX_STATUS: StatusDef = { id: "flux", stack: { kind: "refresh" }, durationMs: 8000 };

/** The proc/crit stream — one stream for every gun, so a replay of the same shots crits the same. */
const combatRng = seededRng("scrap-combat-procs");

/** Flux doubles every channel except itself; it is the one received modifier the chart cannot carry. */
export const FLUX_DAMAGE_MULT = 2;

/** The number the chart scores before zone, type and armor: a gun's base, doubled while fluxed. */
export function hitBase(gun: GunDef, fluxed: boolean): number {
  return fluxed && gun.element !== "flux" ? gun.weapon.damage * FLUX_DAMAGE_MULT : gun.weapon.damage;
}

/**
 * The single hit zone: every pellet lands on the body. Its multiplier carries the shooter's talent
 * `gunDamage`, and its crit fields carry the gun's own crit chance and multiplier, so the shared
 * damage model reproduces one gun's numbers while keeping the chart itself target-only data.
 */
export function zonesFor(gun: GunDef | null, forceCrit = false): HitZoneTable {
  const gunDamage = 1 + bonus("gunDamage");
  const critChance = gun === null ? 0 : forceCrit ? 1 : gun.weapon.critChance + bonus("critChance");
  const critMultiplier = gun === null ? 1 : gun.weapon.critMult + bonus("critDamage");
  return {
    zones: [{ id: "body", multiplier: gunDamage, critChance, critMultiplier: gunDamage * critMultiplier }],
    defaultZone: "body",
    critMultiplier,
  };
}

interface Combat {
  damage: DamageRuntime;
}

const combatOf = perContext((ctx: GameContext): Combat => {
  const damage = createDamageRuntime({
    table: DAMAGE_TABLE,
    zones: zonesFor(null),
    statuses: [FLUX_STATUS],
    rng: combatRng,
    devtoolsName: "scrap.damage",
  });
  // Bodies appear and disappear through many paths (authored spawns, the front, respawns, a restored
  // world); membership is the one event every one of them raises, so profiles are registered here
  // rather than greased into the hit path.
  ctx.scene.entity.subscribeMembership(() => syncCombatTargets(ctx));
  return { damage };
});

/** The body a target presents to the chart: a live shield first, then its authored surface. */
export function resistanceOf(ctx: GameContext, targetId: string): string {
  const shield = ctx.scene.entity.stats.get(targetId, "shield");
  if (shield !== null && shield.current > 0) return "shield";
  const entity = ctx.scene.entity.get(targetId);
  if (entity === null) return "flesh";
  const def = enemyById(entity.name);
  return surfaceOverride(ctx, targetId) ?? def?.surface ?? "flesh";
}

/** Register every combatant the scene holds, so a hit on anything else is a wiring error, not 0. */
export function syncCombatTargets(ctx: GameContext): void {
  const damage = combatOf(ctx).damage;
  const live = new Set<string>();
  for (const entity of ctx.scene.entity.list()) {
    if (enemyById(entity.name) === undefined && entity.role !== "player") continue;
    live.add(entity.id);
    const resistance = resistanceOf(ctx, entity.id);
    const current = damage.target(entity.id);
    if (current === null || current.resistance !== resistance) {
      damage.registerTarget(entity.id, { resistance });
    }
  }
  for (const profile of damage.snapshot().targets) {
    if (!live.has(profile.id)) damage.removeTarget(profile.id);
  }
}

/** Forget a despawned target and any status it carried. */
export function forgetCombatTarget(ctx: GameContext, targetId: string): void {
  combatOf(ctx).damage.removeTarget(targetId);
}

export function isFluxed(ctx: GameContext, targetId: string): boolean {
  return combatOf(ctx).damage.statusesOf(targetId).some((status) => status.status === FLUX_STATUS.id);
}

export interface HitOutcome {
  damage: number;
  crit: boolean;
  /* The shared model's full provenance, for a HUD or a test. */
  resistance: string;
  multiplier: number;
}

/** Per-hit shaping a gun perk asks for: a damage multiplier on the base, and a guaranteed crit. */
export interface GunHitMods {
  damageScale?: number;
  forceCrit?: boolean;
}

/**
 * Resolve one pellet or trigger pull through the shared damage model and apply it to the world. The
 * thrown `UnknownTargetProfileError` is the capability: a hit on a body nobody registered fails loudly
 * instead of quietly dealing its base number.
 */
export function resolveGunHit(
  ctx: GameContext,
  gun: GunDef,
  from: string,
  targetId: string,
  fluxChance: number,
  mods: GunHitMods = {},
): HitOutcome {
  const combat = combatOf(ctx);
  combat.damage.retune({ zones: zonesFor(gun, mods.forceCrit === true) });
  const resistance = resistanceOf(ctx, targetId);
  // A shield going up or down changes the class a body presents; anything never registered is left
  // unregistered on purpose so `hit` raises UnknownTargetProfileError instead of inventing a number.
  const profile = combat.damage.target(targetId);
  if (profile !== null && profile.resistance !== resistance) {
    combat.damage.registerTarget(targetId, { resistance });
  }
  const fluxed = isFluxed(ctx, targetId) && gun.element !== "flux";
  const base = hitBase(gun, fluxed) * (mods.damageScale ?? 1);
  const statuses = gun.element === "flux" ? [{ id: FLUX_STATUS.id, chanceScale: fluxChance }] : [];
  const resolution = combat.damage.hit({
    target: targetId,
    type: gun.element,
    base,
    zone: "body",
    source: from,
    statuses,
  });
  const amount = Math.round(resolution.damage);
  if (amount !== 0) {
    ctx.scene.entity.effect({ from, to: targetId, effect: "damage", via: { amount, item: gun.id } });
  }
  return {
    damage: amount,
    crit: resolution.zone.crit,
    resistance,
    multiplier: resolution.multiplier,
  };
}

/** Advance carried statuses (flux expiry) on the shared model. */
export function tickCombat(ctx: GameContext, dtSeconds: number): void {
  combatOf(ctx).damage.tick(dtSeconds);
}

export function combatState(ctx: GameContext): DamageRuntimeState {
  return combatOf(ctx).damage.snapshot();
}

export function restoreCombat(ctx: GameContext, state: DamageRuntimeState): void {
  const combat = combatOf(ctx);
  combat.damage.restore(state);
  syncCombatTargets(ctx);
}

export function resetCombat(ctx: GameContext): void {
  const combat = combatOf(ctx);
  combat.damage.restore({
    targets: [],
    statuses: { targets: [], ticks: 0, applied: 0, expired: 0 },
    hits: 0,
    crits: 0,
    dealt: 0,
    last: null,
  });
}

export type { GunElement, Surface };

