import { resolveRng } from "../random/resolveRng";
import { clamp01 } from "../math/scalar";

export interface HitZoneDef {
  id: string;
  multiplier?: number;
  critChance?: number;
  /** Crit multiplier in this zone; defaults to the table's `critMultiplier`. */
  critMultiplier?: number;
}

export interface HitZoneTable {
  zones: readonly HitZoneDef[];
  /** Zone used when a caller names one the table does not list. Must appear in `zones`. */
  defaultZone: string;
  /** Base crit chance in `[0,1]`. Default `0`. */
  critChance?: number;
  critMultiplier?: number;
}

export interface HitZoneResolution {
  zone: string;
  crit: boolean;
  /**
   * The one multiplier this hit earns. A crit *replaces* the zone's normal multiplier instead of
   * compounding with it, so a headshot crit can never silently become zone × crit.
   */
  multiplier: number;
  roll: number | null;
  fallback: boolean;
}

/** @capability hit-zone-unknown reject a hit zone table whose named default does not exist */
export class UnknownHitZoneError extends Error {
  readonly zone: string;

  constructor(zone: string) {
    super(`Unknown hit zone: ${zone}`);
    this.name = "UnknownHitZoneError";
    this.zone = zone;
  }
}

export const DEFAULT_CRIT_MULTIPLIER = 2;

function findZone(table: HitZoneTable, zone: string): HitZoneDef | undefined {
  for (const entry of table.zones) if (entry.id === zone) return entry;
  return undefined;
}

/** @capability hit-zone-validate reject a hit-zone table with duplicate zones or a missing default */
export function assertHitZoneTable(table: HitZoneTable): void {
  const seen = new Set<string>();
  for (const zone of table.zones) {
    if (seen.has(zone.id)) throw new RangeError(`Duplicate hit zone: ${zone.id}`);
    seen.add(zone.id);
  }
  if (!seen.has(table.defaultZone)) throw new UnknownHitZoneError(table.defaultZone);
}

/**
 * The multiplier a zone earns for a known crit outcome, without rolling. `resolveHitZone` and a
 * time-to-kill quote both read through this, so a quoted crit uses the same number combat does.
 *
 * @capability hit-zone-multiplier quote a zone's multiplier for a known crit outcome without rolling
 */
export function hitZoneMultiplier(
  table: HitZoneTable,
  zone: string | undefined,
  crit: boolean,
): { zone: string; multiplier: number; fallback: boolean } {
  const named = zone ?? table.defaultZone;
  let entry = findZone(table, named);
  const fallback = entry === undefined;
  if (entry === undefined) entry = findZone(table, table.defaultZone);
  if (entry === undefined) throw new UnknownHitZoneError(named);
  const multiplier = crit
    ? (entry.critMultiplier ?? table.critMultiplier ?? DEFAULT_CRIT_MULTIPLIER)
    : (entry.multiplier ?? 1);
  return { zone: entry.id, multiplier, fallback };
}

/**
 * Resolve where a hit landed into one multiplier: roll the crit chance for that zone, and apply the
 * crit multiplier when it lands, otherwise the zone's own multiplier. The injected `rng` keeps the
 * roll reproducible; a zero chance draws nothing, so a deterministic test can force either outcome.
 *
 * @capability hit-zone resolve a hit zone into one damage multiplier, crit by zone with an injected RNG
 */
export function resolveHitZone(
  table: HitZoneTable,
  zone: string | undefined,
  rng?: () => number,
): HitZoneResolution {
  const chance = clamp01((table.critChance ?? 0) + (findZone(table, zone ?? table.defaultZone)?.critChance ?? 0));
  let roll: number | null = null;
  let crit = false;
  if (chance > 0) {
    roll = resolveRng(rng, "hitZone")();
    crit = roll < chance;
  }
  const resolved = hitZoneMultiplier(table, zone, crit);
  return { zone: resolved.zone, crit, multiplier: resolved.multiplier, roll, fallback: resolved.fallback };
}
