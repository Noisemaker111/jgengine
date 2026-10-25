import {
  createDamageRuntime,
  type DamageRuntime,
  type DamageRuntimeResolution,
} from "@jgengine/core/combat/damageRuntime";
import type { DamageTableDef } from "@jgengine/core/combat/damageTable";
import type { HitZoneTable } from "@jgengine/core/combat/hitZones";
import { resolveAreaTargets } from "@jgengine/core/combat/effects";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { ENEMIES } from "../entities/enemies/catalog";
import { NPCS } from "../entities/npcs/catalog";
import { playerCatalog } from "../entities/players/catalog";
import { vehicleById } from "../entities/vehicles/catalog";
import { AMMO_STAT_IDS, type AmmoKind, type WeaponDef, weaponById } from "../items/weapons/catalog";
import { gunDamageScale } from "../progression/upgrades";

/**
 * Harbor Heat's damage chart. Every crew member and pedestrian is unarmoured `flesh`, a car presents
 * `chassis`, and every street weapon is neutral against both: the chart exists so a resistance or an
 * armoured target is a data change here instead of another hand-written hit path, not so this adoption
 * moves a number. The player's `armor` stat is a pool the effect system drains first, not a table
 * mitigation, so the player is registered at zero armor points and the pools keep deciding absorption.
 */
export const DAMAGE_TABLE: DamageTableDef = {
  types: [
    { id: "ballistic", vs: { flesh: 1, chassis: 1 } },
    { id: "pellet", vs: { flesh: 1, chassis: 1 } },
    { id: "blast", vs: { flesh: 1, chassis: 1 } },
    // A car bumper, a cruiser ram: a blow with no cartridge behind it.
    { id: "impact", vs: { flesh: 1, chassis: 1 } },
  ],
  defaultMultiplier: 1,
  armor: { halfValue: 100, maxMitigation: 0.9 },
};

/** One body zone at 1x: Harbor aims at a silhouette, it does not read limbs off a hit direction. */
export const HIT_ZONES: HitZoneTable = {
  zones: [{ id: "body", multiplier: 1 }],
  defaultZone: "body",
  critChance: 0,
};

/** What a target presents to the chart. `null` for a catalog that takes no damage at all. */
export interface TargetProfileDef {
  resistance: string;
  armor: number;
}

const CREW_PROFILE: TargetProfileDef = { resistance: "flesh", armor: 0 };
const CHASSIS_PROFILE: TargetProfileDef = { resistance: "chassis", armor: 0 };

/** The resistance a spawn kind presents, or null when the catalog takes no damage. */
export function profileFor(catalogId: string): TargetProfileDef | null {
  if (catalogId === playerCatalog.id) return CREW_PROFILE;
  if (ENEMIES.some((enemy) => enemy.id === catalogId)) return CREW_PROFILE;
  if (NPCS.some((npc) => npc.id === catalogId)) return CREW_PROFILE;
  if (vehicleById(catalogId) !== undefined) return CHASSIS_PROFILE;
  return null;
}

/** The chart type one ammo kind lands as. Grenades have no cartridge, so they are blast. */
export function damageTypeFor(ammo: AmmoKind): string {
  if (ammo === "shell") return "pellet";
  if (ammo === "none") return "blast";
  return "ballistic";
}

/** One weapon's row in the chart: what a single pellet of it is worth before zones and armor. */
export function weaponHit(weaponId: string): { type: string; base: number } | null {
  const def: WeaponDef | undefined = weaponById(weaponId);
  if (def === undefined) return null;
  return { type: damageTypeFor(def.ammo), base: def.weapon.damage };
}

/** The ammo stat a weapon spends, for a HUD line or a reserve check. */
export function ammoStatFor(ammo: AmmoKind): string | null {
  return ammo === "none" ? null : AMMO_STAT_IDS[ammo];
}

function createHarborDamage(ctx: GameContext): DamageRuntime {
  return createDamageRuntime({
    table: DAMAGE_TABLE,
    zones: HIT_ZONES,
    // No crit rolls: the chart has a zero crit chance, and a shot must land the same number twice.
    rng: () => 0.5,
    events: ctx.game.events,
    healthOf: (target) => ctx.scene.entity.stats.get(target, "health")?.current ?? null,
    positionOf: (target) => ctx.scene.entity.get(target)?.position,
    devtoolsName: "harbor.damage",
  });
}

const damageOf = perContext((ctx: GameContext): { runtime: DamageRuntime } => ({ runtime: createHarborDamage(ctx) }));

/** The one damage model for this world. */
export function harborDamage(ctx: GameContext): DamageRuntime {
  return damageOf(ctx).runtime;
}

/**
 * Register the profile a scene entity presents, from its catalog. Returns false for a kind that takes
 * no damage - the caller then leaves it alone instead of routing a hit at an unprofiled target.
 */
export function registerAsTarget(ctx: GameContext, instanceId: string): boolean {
  const entity = ctx.scene.entity.get(instanceId);
  if (entity === null) return false;
  const profile = profileFor(entity.name);
  if (profile === null) return false;
  harborDamage(ctx).registerTarget(instanceId, profile);
  return true;
}

/**
 * Resolve one blow through the chart and land it through the engine's effect system, so stat-pool
 * absorption, ordered spillover, death and the kill feed stay the engine's. Returns the resolution, or
 * null when the target takes no damage.
 */
export function landHit(
  ctx: GameContext,
  input: { from: string; to: string; type: string; base: number; position?: readonly [number, number, number] },
): DamageRuntimeResolution | null {
  if (!registerAsTarget(ctx, input.to)) return null;
  const resolution = harborDamage(ctx).hit({
    target: input.to,
    type: input.type,
    base: input.base,
    source: input.from,
    ...(input.position === undefined ? {} : { position: input.position }),
  });
  if (resolution.damage > 0) {
    ctx.scene.entity.effect({ from: input.from, to: input.to, effect: "damage", via: { amount: resolution.damage } });
  }
  return resolution;
}

/** Land one weapon pellet on one target. */
export function landWeaponHit(
  ctx: GameContext,
  input: { from: string; to: string; weaponId: string; position?: readonly [number, number, number] },
): DamageRuntimeResolution | null {
  const hit = weaponHit(input.weaponId);
  if (hit === null) return null;
  return landHit(ctx, { from: input.from, to: input.to, type: hit.type, base: input.from === ctx.player.userId ? Math.round(hit.base * gunDamageScale(ctx)) : hit.base, position: input.position });
}

/**
 * Land a blast: each body inside the radius takes its share of one payload on the shared linear
 * falloff, resolved through the chart like any other hit. Target selection and the falloff are the
 * shared area query, not a second copy of the arithmetic.
 *
 * Harbor injects no line-of-sight occluder, so the engine's own area effect never blocked a blast on
 * a wall and neither does this - the point-source check is the open-field default, while an entity
 * source keeps whatever the entity query says.
 */
export function landBlast(
  ctx: GameContext,
  input: { from: string; at: readonly [number, number, number]; radius: number; type: string; base: number },
): DamageRuntimeResolution[] {
  const spatial = {
    inRadius: (center: readonly [number, number, number], radius: number) => ctx.scene.entity.inRadius(center, radius),
    hasLineOfSight: (from: readonly [number, number, number] | string, to: string) =>
      typeof from === "string" ? ctx.scene.entity.hasLineOfSight(from, to) : true,
    positionOf: (instanceId: string) => ctx.scene.entity.get(instanceId)?.position,
  };
  const targets = resolveAreaTargets(spatial, { at: input.at, radius: input.radius, falloff: "linear" }, (instanceId) =>
    ctx.scene.entity.canReceive(instanceId, "damage") === null,
  );

  const landed: DamageRuntimeResolution[] = [];
  for (const target of targets) {
    const resolution = landHit(ctx, {
      from: input.from,
      to: target.instanceId,
      type: input.type,
      base: input.base * target.scale,
      position: input.at,
    });
    if (resolution !== null) landed.push(resolution);
  }
  return landed;
}

/** Land a thrown weapon's explosion, with the payload read from the weapon's own chart row. */
export function landExplosion(
  ctx: GameContext,
  input: { from: string; at: readonly [number, number, number]; radius: number; weaponId: string },
): DamageRuntimeResolution[] {
  const hit = weaponHit(input.weaponId);
  if (hit === null) return [];
  return landBlast(ctx, { from: input.from, at: input.at, radius: input.radius, type: hit.type, base: hit.base });
}
