import type { WeaponHandlingTuning } from "./weaponHandling";

/** A world-space point or direction in metres. */
export type WeaponVec3 = readonly [number, number, number];

/** How a held or tapped trigger turns into shots. */
export type WeaponFireMode = "single" | "auto" | "burst";

/** Shots one trigger pull commits to. A burst finishes even if the trigger is released. */
export interface WeaponBurstDef {
  /** Shots per pull, `1..64`. */
  count: number;
}

/** A ray resolved in the caller's world on the same tick it is fired. */
export interface WeaponHitscanDef {
  kind: "hitscan";
  /** Longest ray the caller may return a contact within, m. Required so every shot is bounded. */
  maxRange: number;
}

/** A travelling pellet simulated by the runtime, resolved when it meets the caller's world. */
export interface WeaponProjectileDef {
  kind: "projectile";
  /** Launch speed, m/s. */
  speed: number;
  /** Downward acceleration, m/s². `0` flies straight; `9.81` is Earth gravity for reference. */
  gravity?: number;
  /** Linear velocity decay, 1/s. `0` keeps speed until it hits. */
  drag?: number;
  /** Seconds before an unspent projectile expires. Required so every pellet is bounded. */
  lifetime: number;
  /** Optional hard distance cap, m, on top of `lifetime`. */
  maxRange?: number;
}

/** Loaded rounds, reload time, and where reloads draw from. */
export interface WeaponMagazineDef {
  capacity: number;
  reloadMs: number;
  /** Rounds available to reload from; omitted means an unlimited reserve. */
  reserve?: number;
}

/** What one pellet does when it reaches a registered damage target. */
export interface WeaponDamageDef {
  /** Damage type id in the caller's `DamageTableDef`. */
  type: string;
  /** Damage before the hit-zone multiplier, the table, armor, and falloff. */
  base: number;
  /** Status ids the hit tries to apply; the damage runtime owns their chance and effects. */
  statuses?: readonly string[];
}

/** Linear damage falloff between two distances. */
export interface WeaponFalloffDef {
  /** Distance, m, where damage starts dropping. */
  start: number;
  /** Distance, m, where it reaches `endScale`; clamped beyond. */
  end: number;
  /** Damage multiplier at `end`, `0..1`. */
  endScale: number;
}

/**
 * One weapon as plain data: cadence, fire mode, delivery, magazine, feel and damage. Nothing here is
 * a function, so a generator can roll it, a save can store it, and two weapons differ by their fields.
 */
export interface WeaponDefinition {
  id: string;
  /** Shots per minute at full cadence. */
  roundsPerMinute: number;
  fireMode: WeaponFireMode;
  /** Burst size; required for `"burst"` and ignored otherwise. */
  burst?: WeaponBurstDef;
  delivery: WeaponHitscanDef | WeaponProjectileDef;
  /** Pellets per shot, `1..64` (default `1`). */
  pellets?: number;
  /** Discrete ammo; omit for a weapon that never runs dry or reloads. */
  magazine?: WeaponMagazineDef;
  /** Recoil pattern, spread bloom and ADS time — exactly what `createWeaponHandling` consumes. */
  handling: WeaponHandlingTuning;
  damage: WeaponDamageDef;
  /** Damage over distance, applied to both deliveries. Omit for no falloff. */
  falloff?: WeaponFalloffDef;
  /** Most pellets this weapon keeps live at once (default `32`, clamp `1..256`). */
  maxInFlight?: number;
  /** Start a reload by itself when the trigger is pulled dry (default `true`). */
  autoReload?: boolean;
}

/** Cap on `WeaponDefinition.maxInFlight`; bounds per-tick projectile work. */
export const MAX_WEAPON_PELLETS_IN_FLIGHT = 256;

/** Default live-pellet cap for a weapon that does not name one. */
export const DEFAULT_WEAPON_PELLETS_IN_FLIGHT = 32;

/** Cap on `WeaponDefinition.pellets`; bounds rays and damage resolutions per shot. */
export const MAX_WEAPON_PELLETS_PER_SHOT = 64;

/** Cap on `WeaponBurstDef.count`. */
export const MAX_WEAPON_BURST_COUNT = 64;

function assertFinite(value: number, field: string, min: number, max?: number): void {
  if (!Number.isFinite(value) || value < min || (max !== undefined && value > max)) {
    const range = max === undefined ? `>= ${min}` : `in [${min}, ${max}]`;
    throw new RangeError(`Weapon definition field "${field}" must be a finite number ${range}; got ${String(value)}`);
  }
}

/**
 * Check a definition before it reaches the runtime, so a rolled weapon fails loudly at construction
 * instead of firing nothing. Throws `RangeError` naming the field.
 *
 * @capability weapon-definition-validate reject a malformed weapon definition at construction with the field named
 */
export function assertWeaponDefinition(definition: WeaponDefinition): void {
  if (definition.id.trim() === "") throw new RangeError('Weapon definition field "id" must not be empty');
  assertFinite(definition.roundsPerMinute, "roundsPerMinute", Number.MIN_VALUE);
  if (definition.fireMode !== "single" && definition.fireMode !== "auto" && definition.fireMode !== "burst") {
    throw new RangeError(`Weapon definition field "fireMode" must be single, auto or burst; got ${String(definition.fireMode)}`);
  }
  if (definition.fireMode === "burst") {
    if (definition.burst === undefined) throw new RangeError('Weapon definition field "burst" is required for fireMode "burst"');
    assertFinite(definition.burst.count, "burst.count", 1, MAX_WEAPON_BURST_COUNT);
    if (!Number.isInteger(definition.burst.count)) throw new RangeError('Weapon definition field "burst.count" must be an integer');
  }
  if (definition.pellets !== undefined) {
    assertFinite(definition.pellets, "pellets", 1, MAX_WEAPON_PELLETS_PER_SHOT);
    if (!Number.isInteger(definition.pellets)) throw new RangeError('Weapon definition field "pellets" must be an integer');
  }
  if (definition.maxInFlight !== undefined) {
    assertFinite(definition.maxInFlight, "maxInFlight", 1, MAX_WEAPON_PELLETS_IN_FLIGHT);
    if (!Number.isInteger(definition.maxInFlight)) throw new RangeError('Weapon definition field "maxInFlight" must be an integer');
  }
  assertFinite(definition.damage.base, "damage.base", Number.MIN_VALUE);
  if (definition.damage.type.trim() === "") throw new RangeError('Weapon definition field "damage.type" must not be empty');

  const delivery = definition.delivery;
  if (delivery.kind === "hitscan") {
    assertFinite(delivery.maxRange, "delivery.maxRange", Number.MIN_VALUE);
  } else if (delivery.kind === "projectile") {
    assertFinite(delivery.speed, "delivery.speed", Number.MIN_VALUE);
    assertFinite(delivery.lifetime, "delivery.lifetime", Number.MIN_VALUE);
    if (delivery.gravity !== undefined) assertFinite(delivery.gravity, "delivery.gravity", 0, 1e5);
    if (delivery.drag !== undefined) assertFinite(delivery.drag, "delivery.drag", 0, 1e5);
    if (delivery.maxRange !== undefined) assertFinite(delivery.maxRange, "delivery.maxRange", Number.MIN_VALUE);
  } else {
    throw new RangeError(`Weapon definition field "delivery.kind" must be hitscan or projectile; got ${String((delivery as { kind: unknown }).kind)}`);
  }

  if (definition.magazine !== undefined) {
    assertFinite(definition.magazine.capacity, "magazine.capacity", 1);
    if (!Number.isInteger(definition.magazine.capacity)) throw new RangeError('Weapon definition field "magazine.capacity" must be an integer');
    assertFinite(definition.magazine.reloadMs, "magazine.reloadMs", 0);
    if (definition.magazine.reserve !== undefined) assertFinite(definition.magazine.reserve, "magazine.reserve", 0);
  }

  assertFinite(definition.handling.spread.base, "handling.spread.base", 0, Math.PI / 2);
  if (definition.handling.spread.perShot !== undefined) assertFinite(definition.handling.spread.perShot, "handling.spread.perShot", 0);
  if (definition.handling.spread.recoverRate !== undefined) assertFinite(definition.handling.spread.recoverRate, "handling.spread.recoverRate", 0);

  if (definition.falloff !== undefined) {
    assertFinite(definition.falloff.start, "falloff.start", 0);
    assertFinite(definition.falloff.end, "falloff.end", 0);
    assertFinite(definition.falloff.endScale, "falloff.endScale", 0, 1);
    if (definition.falloff.end < definition.falloff.start) {
      throw new RangeError('Weapon definition field "falloff.end" must not be before "falloff.start"');
    }
  }
}

/**
 * Milliseconds between shots at full cadence: `60_000 / roundsPerMinute`.
 *
 * @capability weapon-cadence convert a rounds-per-minute weapon rate into the interval a fire gate takes
 */
export function weaponIntervalMs(definition: WeaponDefinition): number {
  return 60_000 / definition.roundsPerMinute;
}

/** Damage multiplier at a distance: `1` before `falloff.start`, linearly down to `endScale` at `end`. */
export function weaponDamageAt(definition: WeaponDefinition, distance: number): number {
  const falloff = definition.falloff;
  if (falloff === undefined || distance <= falloff.start) return 1;
  if (falloff.end <= falloff.start) return falloff.endScale;
  const t = Math.min(1, (distance - falloff.start) / (falloff.end - falloff.start));
  return 1 + (falloff.endScale - 1) * t;
}

/** Live pellets one definition may keep, clamped to a bounded range. */
export function weaponMaxInFlight(definition: WeaponDefinition): number {
  return Math.min(
    MAX_WEAPON_PELLETS_IN_FLIGHT,
    Math.max(1, Math.floor(definition.maxInFlight ?? DEFAULT_WEAPON_PELLETS_IN_FLIGHT)),
  );
}
