import {
  MAX_WEAPON_PELLETS_PER_SHOT,
  type WeaponDefinition,
} from "../combat/weaponDefinition";
import type { LootItem } from "./lootGen";

/**
 * Which rolled stat feeds which part of a {@link WeaponDefinition}. Every field is a stat id from the
 * item; an omitted field keeps the template's value, so a catalog only maps what it rolls.
 */
export interface LootWeaponStatMap {
  roundsPerMinute?: string;
  damage?: string;
  pellets?: string;
  /** Requires the template to declare a magazine. */
  magazineCapacity?: string;
  reloadMs?: string;
  /** Spread half-angle in radians, clamped to `0..PI/2`. */
  spreadBase?: string;
  /** Hitscan range, or a projectile's hard distance cap. */
  maxRange?: string;
  /** Projectile launch speed. */
  projectileSpeed?: string;
}

/** A base weapon definition plus the stat map a rolled item overrides. */
export interface LootWeaponProjection {
  template: WeaponDefinition;
  stats: LootWeaponStatMap;
  /** Definition id override; defaults to `loot.<baseId>.<rarity>`. */
  id?: string;
}

function statOf(item: LootItem, statId: string | undefined): number | undefined {
  if (statId === undefined) return undefined;
  const value = item.stats[statId];
  if (value === undefined) throw new RangeError(`Loot weapon projection names stat "${statId}" but the item does not roll it`);
  if (!Number.isFinite(value)) throw new RangeError(`Loot weapon projection stat "${statId}" is ${String(value)}`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Project a rolled item onto a plain weapon definition: copy the template, then write the mapped
 * stats into rate, damage, magazine, spread, range and projectile speed. The result is a
 * {@link WeaponDefinition}, so `assertWeaponDefinition` and `createWeaponSystem` accept it unchanged.
 *
 * @capability loot-weapon feed a rolled item into a weapon definition so generated gear fires through the weapon system
 */
export function lootWeaponDefinition(item: LootItem, projection: LootWeaponProjection): WeaponDefinition {
  const template = projection.template;
  const map = projection.stats;
  const definition: WeaponDefinition = {
    ...template,
    id: projection.id ?? `loot.${item.baseId}.${item.rarity}`,
    delivery: { ...template.delivery },
    handling: { ...template.handling, spread: { ...template.handling.spread } },
    damage: { ...template.damage },
    ...(template.magazine === undefined ? {} : { magazine: { ...template.magazine } }),
    ...(template.burst === undefined ? {} : { burst: { ...template.burst } }),
    ...(template.falloff === undefined ? {} : { falloff: { ...template.falloff } }),
  };

  const rate = statOf(item, map.roundsPerMinute);
  if (rate !== undefined) definition.roundsPerMinute = Math.max(Number.MIN_VALUE, rate);

  const damage = statOf(item, map.damage);
  if (damage !== undefined) definition.damage.base = Math.max(Number.MIN_VALUE, damage);

  const pellets = statOf(item, map.pellets);
  if (pellets !== undefined) {
    definition.pellets = clamp(Math.round(pellets), 1, MAX_WEAPON_PELLETS_PER_SHOT);
  }

  const capacity = statOf(item, map.magazineCapacity);
  const reloadMs = statOf(item, map.reloadMs);
  if (capacity !== undefined || reloadMs !== undefined) {
    if (definition.magazine === undefined) {
      throw new RangeError('Loot weapon projection maps magazineCapacity or reloadMs but the template has no magazine');
    }
    if (capacity !== undefined) definition.magazine.capacity = Math.max(1, Math.round(capacity));
    if (reloadMs !== undefined) definition.magazine.reloadMs = Math.max(0, reloadMs);
  }

  const spread = statOf(item, map.spreadBase);
  if (spread !== undefined) definition.handling.spread.base = clamp(spread, 0, Math.PI / 2);

  const range = statOf(item, map.maxRange);
  if (range !== undefined) definition.delivery.maxRange = Math.max(Number.MIN_VALUE, range);

  const speed = statOf(item, map.projectileSpeed);
  if (speed !== undefined) {
    if (definition.delivery.kind !== "projectile") {
      throw new RangeError('Loot weapon projection maps projectileSpeed but the template is hitscan');
    }
    definition.delivery.speed = Math.max(Number.MIN_VALUE, speed);
  }

  return definition;
}
