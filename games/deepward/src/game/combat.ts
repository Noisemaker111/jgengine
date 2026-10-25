import { createDamageRuntime, type DamageRuntime } from "@jgengine/core/combat/damageRuntime";
import type { DamageTableDef } from "@jgengine/core/combat/damageTable";
import type { HitZoneTable } from "@jgengine/core/combat/hitZones";
import { weaponIntervalMs, type WeaponDefinition } from "@jgengine/core/combat/weaponDefinition";
import { createWeaponSystem, type WeaponContact, type WeaponSystem } from "@jgengine/core/combat/weaponSystem";
import { PRINT_ID, lineOfSight, type Place, type Point } from "../world";
import { FAUNA } from "../world";
import { SPECIES, isSpecies } from "./fauna";
import { weaponStats, type Item } from "./items";
import type { Dive } from "./state";

/** What the printer's Fitter starts with, and the health a HUD line reads. */
export const FITTER_HEALTH = 80;
/** Half-width of the Fitter's hittable silhouette, m - the aim tolerance the shot test has always used. */
export const AIM_TOLERANCE = 0.65;
export const SIDEARM_RANGE = 24;
export const RIFLE_RANGE = 30;
export const MAGAZINE = 6;
export const RELOAD_SECONDS = 1.3;
/** Issue hand: 20 damage on a 0.32 s cycle. */
export const SIDEARM = { damage: 20, interval: 0.32, label: "Kessler / issue sidearm" } as const;

/** Both hands draw from the one reserve the tank refit buys. */
export function reserveOf(refits: readonly string[]): number {
  return refits.includes("reserve") ? 30 : 18;
}

/**
 * The station's damage chart. The Fitter is unarmoured flesh, so a kinetic hit lands its base
 * number; the chart exists so an armoured print or a second damage type is a data change here
 * instead of another hit path. Zones are one body zone at 1x for the same reason.
 */
export const DAMAGE_TABLE: DamageTableDef = {
  types: [{ id: "kinetic", vs: { flesh: 1 } }],
  defaultMultiplier: 1,
  armor: { halfValue: 100, maxMitigation: 0.9 },
};

export const HIT_ZONES: HitZoneTable = {
  zones: [{ id: "body", multiplier: 1 }],
  defaultZone: "body",
  critChance: 0,
};

/** One damage model per world, with the Fitter already registered as a target. */
export function createDeepwardDamage(rng: () => number): DamageRuntime {
  const damage = createDamageRuntime({ table: DAMAGE_TABLE, zones: HIT_ZONES, rng, devtoolsName: "deepward.damage" });
  damage.registerTarget(PRINT_ID, { resistance: "flesh", armor: 0 });
  // Every creature is flesh; the Overrun's hide is armour enough that a sidearm barely marks it.
  for (const spawn of FAUNA) damage.registerTarget(spawn.id, { resistance: "flesh", armor: spawn.species === "overrun" ? 220 : 0 });
  return damage;
}

function definition(id: string, damage: number, interval: number, range: number, reserve: number): WeaponDefinition {
  return {
    id,
    // Rounds per minute from a cycle in seconds: one round every `interval` seconds.
    roundsPerMinute: 60 / interval,
    fireMode: "auto",
    delivery: { kind: "hitscan", maxRange: range },
    magazine: { capacity: MAGAZINE, reloadMs: RELOAD_SECONDS * 1000, reserve },
    // The game aims with the camera: no bloom or recoil, so a shot goes where the crosshair points.
    handling: { spread: { base: 0 } },
    damage: { type: "kinetic", base: damage },
    // Pulling an empty trigger reports it and waits for R, as the HUD line always said.
    autoReload: false,
  };
}

export function sidearmDefinition(reserve: number): WeaponDefinition {
  return definition("kessler-sidearm", SIDEARM.damage, SIDEARM.interval, SIDEARM_RANGE, reserve);
}

/** The rolled rifle's own numbers drive the shot, so an affix changes what firing does. */
export function rifleDefinition(item: Item, reserve: number): WeaponDefinition {
  const stats = weaponStats(item);
  return definition(`kessler-rifle:${item.id}`, stats.damage, stats.interval, RIFLE_RANGE, reserve);
}

export function rifleInHand(dive: Dive): Item | null {
  return dive.cache.find(item => item.baseId === "service-rifle") ?? null;
}

/** The definition in force for the hand the diver is holding; both hands draw the dive's issued reserve. */
export function weaponDefinition(dive: Dive): WeaponDefinition {
  if (dive.hand !== "service-rifle") return sidearmDefinition(dive.reservePool);
  const rifle = rifleInHand(dive);
  return rifle === null ? sidearmDefinition(dive.reservePool) : rifleDefinition(rifle, dive.reservePool);
}

/** What a HUD line and the weapon pose read about the hand in force. */
export function weaponReadout(dive: Dive | null): { damage: number; interval: number; label: string } {
  if (dive === null) return { damage: SIDEARM.damage, interval: SIDEARM.interval, label: SIDEARM.label };
  const definition = weaponDefinition(dive);
  const rifle = rifleInHand(dive);
  return {
    damage: definition.damage.base,
    interval: weaponIntervalMs(definition) / 1000,
    label: rifle === null || dive.hand !== "service-rifle" ? SIDEARM.label : weaponStats(rifle).label,
  };
}

/** Where a shot originates: the diver's eye, the same 1.62 m the camera sits at. */
export function muzzleOf(at: Point): Point {
  return [at[0], 1.62, at[2]];
}

/** The Fitter's body point a ray is tested against. */
export function fitterPoint(print: Dive["print"]): Point {
  return [print.at[0], 1.1, print.at[2]];
}

/**
 * The game's one world query for a shot: does this ray reach the Fitter? The same test the local
 * hit path used - inside the weapon's range, within {@link AIM_TOLERANCE} of the body point, and a
 * clear line from where the diver stands - so adopting the runtime did not move what counts as a hit.
 */
export function fitterContact(input: {
  from: Point;
  direction: Point;
  maxRange: number;
  diverAt: Point;
  print: Dive["print"];
}): WeaponContact | null {
  if (input.print.health <= 0) return null;
  const enemy = fitterPoint(input.print);
  const delta: Point = [enemy[0] - input.from[0], enemy[1] - input.from[1], enemy[2] - input.from[2]];
  const along = delta[0] * input.direction[0] + delta[1] * input.direction[1] + delta[2] * input.direction[2];
  const miss = Math.hypot(delta[0] - along * input.direction[0], delta[1] - along * input.direction[1], delta[2] - along * input.direction[2]);
  if (!(along > 0 && along < input.maxRange && miss <= AIM_TOLERANCE)) return null;
  if (!lineOfSight(input.diverAt, input.print.at)) return null;
  return { target: PRINT_ID, point: enemy };
}

/** A creature a shot can land on: where it stands and how big its body is. */
export interface ShotTarget { id: string; at: Point; size: number }

export interface WeaponDepsInput {
  rng: () => number;
  damage: DamageRuntime;
  at: () => Point | null;
  print: () => Dive["print"] | null;
  /** Creatures in the stratum the diver stands in, and that stratum's walls. */
  creatures?: () => readonly ShotTarget[];
  place?: () => Place;
}

/** The nearest creature along the ray, with the same aim tolerance (scaled by body size) and wall test. */
export function creatureContact(input: { from: Point; direction: Point; maxRange: number; diverAt: Point; targets: readonly ShotTarget[]; place: Place }): (WeaponContact & { distance: number }) | null {
  let best: (WeaponContact & { distance: number }) | null = null;
  for (const target of input.targets) {
    const body: Point = [target.at[0], Math.min(1.1, target.size * 0.9), target.at[2]];
    const delta: Point = [body[0] - input.from[0], body[1] - input.from[1], body[2] - input.from[2]];
    const along = delta[0] * input.direction[0] + delta[1] * input.direction[1] + delta[2] * input.direction[2];
    const miss = Math.hypot(delta[0] - along * input.direction[0], delta[1] - along * input.direction[1], delta[2] - along * input.direction[2]);
    if (!(along > 0 && along < input.maxRange && miss <= Math.max(AIM_TOLERANCE * 0.8, target.size * 0.7))) continue;
    if (!lineOfSight(input.diverAt, target.at, input.place)) continue;
    if (best === null || along < best.distance) best = { target: target.id, point: body, distance: along };
  }
  return best;
}

/** Creatures alive in a stratum, as shot targets. */
export function shotTargets(fauna: Dive["fauna"], place: Place): ShotTarget[] {
  return Object.values(fauna).filter(creature => creature.place === place && creature.health > 0 && isSpecies(creature.species))
    .map(creature => ({ id: creature.id, at: creature.at, size: SPECIES[creature.species].size }));
}

/** One held weapon per dive; the hand is swapped by retuning it, so ammo and cadence carry over. */
export function createDeepwardWeapon(definition: WeaponDefinition, deps: WeaponDepsInput): WeaponSystem {
  return createWeaponSystem(definition, {
    rng: deps.rng,
    damage: deps.damage,
    origin: () => muzzleOf(deps.at() ?? [0, 0, 0]),
    // A shot fires at most once per frame: the game's trigger never caught up on a long frame.
    maxShotsPerTick: 1,
    raycast(from, direction, maxRange) {
      const at = deps.at(), print = deps.print();
      if (at === null) return null;
      const place = deps.place?.() ?? "vault";
      // The Fitter walks receiving only; below it, the shot meets whatever lives on that floor.
      const fitter = print === null || place !== "vault" ? null : fitterContact({ from, direction, maxRange, diverAt: at, print });
      const creature = deps.creatures === undefined ? null : creatureContact({ from, direction, maxRange, diverAt: at, targets: deps.creatures(), place });
      if (fitter === null) return creature === null ? null : { target: creature.target, point: creature.point };
      if (creature === null) return fitter;
      const fitterRange = Math.hypot(fitter.point[0] - from[0], fitter.point[1] - from[1], fitter.point[2] - from[2]);
      return creature.distance < fitterRange ? { target: creature.target, point: creature.point } : fitter;
    },
    devtoolsName: "deepward.weapon",
  });
}
