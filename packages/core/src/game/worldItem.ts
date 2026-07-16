import type { EntityPosition } from "../scene/entityStore";
import { distanceBetween } from "../scene/spatial";
import { evaluateLootFilter, type LootFilterItem, type LootFilterRule } from "./lootFilter";
import type { Drop } from "./lootTable";

/** Scene-entity catalog name every dropped-item instance spawns under (see the three buckets: worldItem is an entity, never an inventory item or object). */
export const WORLD_ITEM_ENTITY_NAME = "world_item";
export const DEFAULT_RARITY = "common";
export const DEFAULT_PICKUP_RADIUS = 2;

export interface ScatterOptions {
  radius: number;
  minRadius?: number;
  height?: number;
}

export const DEFAULT_SCATTER: ScatterOptions = { radius: 1.5, minRadius: 0.4, height: 0 };

/** Random offset within an annulus `[minRadius, radius]` around the origin — the on-death scatter impulse.
 * @internal
 */
export function scatterOffset(rng: () => number, options: ScatterOptions = DEFAULT_SCATTER): EntityPosition {
  const angle = rng() * Math.PI * 2;
  const min = options.minRadius ?? 0;
  const span = Math.max(options.radius - min, 0);
  const distance = min + rng() * span;
  return [Math.cos(angle) * distance, options.height ?? 0, Math.sin(angle) * distance];
}

/** @internal */
export function scatterPosition(
  origin: EntityPosition,
  rng: () => number,
  options: ScatterOptions = DEFAULT_SCATTER,
): EntityPosition {
  const offset = scatterOffset(rng, options);
  return [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]];
}

export interface WorldItemRecord {
  instanceId: string;
  itemId: string;
  rarity: string;
  baseType: string;
  count: number;
  affixTier?: number;
  source?: string;
  droppedAt: number;
}

export interface WorldItemSpawnInput {
  itemId: string;
  position: EntityPosition;
  rarity?: string;
  baseType?: string;
  count?: number;
  affixTier?: number;
  source?: string;
}

export interface WorldItemStoreDeps {
  spawnEntity(position: EntityPosition): string;
  despawnEntity(instanceId: string): boolean;
  resolvePosition(instanceId: string): EntityPosition | undefined;
  now?(): number;
}

export interface WorldItemStore {
  spawn(input: WorldItemSpawnInput): WorldItemRecord;
  get(instanceId: string): WorldItemRecord | null;
  list(): readonly WorldItemRecord[];
  nearestInRadius(
    from: EntityPosition,
    radius: number,
    filter?: (record: WorldItemRecord) => boolean,
  ): string | null;
  /** Detaches the record for a pickup: caller is expected to grant its contents (e.g. `loot.grantToPlayer`) itself. */
  take(instanceId: string): WorldItemRecord | null;
  /** Consumes/destroys the record with no grant implied (decay, an explosion, a cleanup sweep) — same despawn path as `take`, leaves no orphaned record. */
  remove(instanceId: string): WorldItemRecord | null;
}

/** Pure pickup-radius + nearest-item selection, usable without a live store (click-to-grab, proximity prompts).
 * @internal
 */
export function selectNearestWorldItem(
  candidates: readonly { instanceId: string; position: EntityPosition }[],
  from: EntityPosition,
  radius: number,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = distanceBetween(from, candidate.position);
    if (distance <= radius && distance < bestDistance) {
      bestDistance = distance;
      bestId = candidate.instanceId;
    }
  }
  return bestId;
}

/**
 * Spawn and track pickup-able items scattered in the world, including drops that scatter on death.
 *
 * @capability world-drops spawn pickup-able items in the world, including death drops
  * @internal
  */
export function createWorldItemStore(deps: WorldItemStoreDeps): WorldItemStore {
  const records = new Map<string, WorldItemRecord>();
  const now = deps.now ?? Date.now;

  function removeRecord(instanceId: string): WorldItemRecord | null {
    const record = records.get(instanceId);
    if (record === undefined) return null;
    records.delete(instanceId);
    deps.despawnEntity(instanceId);
    return record;
  }

  return {
    spawn(input) {
      const instanceId = deps.spawnEntity(input.position);
      const record: WorldItemRecord = {
        instanceId,
        itemId: input.itemId,
        rarity: input.rarity ?? DEFAULT_RARITY,
        baseType: input.baseType ?? input.itemId,
        count: input.count ?? 1,
        droppedAt: now(),
      };
      if (input.affixTier !== undefined) record.affixTier = input.affixTier;
      if (input.source !== undefined) record.source = input.source;
      records.set(instanceId, record);
      return record;
    },
    get(instanceId) {
      return records.get(instanceId) ?? null;
    },
    list() {
      return [...records.values()];
    },
    nearestInRadius(from, radius, filter) {
      const candidates: { instanceId: string; position: EntityPosition }[] = [];
      for (const record of records.values()) {
        if (filter !== undefined && !filter(record)) continue;
        const position = deps.resolvePosition(record.instanceId);
        if (position !== undefined) candidates.push({ instanceId: record.instanceId, position });
      }
      return selectNearestWorldItem(candidates, from, radius);
    },
    take(instanceId) {
      return removeRecord(instanceId);
    },
    remove(instanceId) {
      return removeRecord(instanceId);
    },
  };
}

export interface ResolveDeathDropsOptions {
  mode: "grant" | "world";
  origin: EntityPosition;
  resolveRarity(itemId: string): string;
  resolveBaseType?(itemId: string): string;
  scatter?: ScatterOptions;
  rng?(): number;
  source?: string;
}

export interface ResolvedDeathDrops {
  worldSpawns: WorldItemSpawnInput[];
  grants: Drop[];
}

/**
 * Splits rolled death drops between direct grants and scattered ground items.
 * `mode: "grant"` is the legacy behavior (loot straight to inventory); `mode:
 * "world"` routes item drops through a scatter impulse and leaves currency
 * drops granting directly (coins fly to the killer, gear hits the ground).
  * @internal
  */
export function resolveDeathDrops(
  drops: readonly Drop[],
  options: ResolveDeathDropsOptions,
): ResolvedDeathDrops {
  if (options.mode !== "world") return { worldSpawns: [], grants: [...drops] };
  const rng = options.rng ?? Math.random;
  const worldSpawns: WorldItemSpawnInput[] = [];
  const grants: Drop[] = [];
  for (const drop of drops) {
    if (drop.item === undefined) {
      grants.push(drop);
      continue;
    }
    const spawn: WorldItemSpawnInput = {
      itemId: drop.item,
      count: drop.count,
      rarity: options.resolveRarity(drop.item),
      position: scatterPosition(options.origin, rng, options.scatter),
    };
    if (options.resolveBaseType !== undefined) spawn.baseType = options.resolveBaseType(drop.item);
    if (options.source !== undefined) spawn.source = options.source;
    worldSpawns.push(spawn);
  }
  return { worldSpawns, grants };
}

export interface RarityStyle {
  color?: string;
  beam?: boolean;
  label?: string;
}

export interface WorldItemPresentation {
  hidden: boolean;
  color?: string;
  beam: boolean;
  label?: string;
}

/**
 * Composes the baseline rarity→beam/color/label render binding (#32, catalog
 * data the game supplies) with the loot-filter rule overrides (#33). A
 * matching rule wins field-by-field; unmatched fields fall back to the
 * rarity's baseline style.
  * @internal
  */
export function resolveWorldItemPresentation(
  item: LootFilterItem,
  rarityStyle: Record<string, RarityStyle> | undefined,
  rules: readonly LootFilterRule[] | undefined,
): WorldItemPresentation {
  const base = rarityStyle?.[item.rarity];
  const override = rules === undefined || rules.length === 0 ? {} : evaluateLootFilter(rules, item);
  const presentation: WorldItemPresentation = {
    hidden: override.hidden ?? false,
    beam: override.beam ?? base?.beam ?? false,
  };
  const color = override.color ?? base?.color;
  if (color !== undefined) presentation.color = color;
  const label = override.label ?? base?.label;
  if (label !== undefined) presentation.label = label;
  return presentation;
}
