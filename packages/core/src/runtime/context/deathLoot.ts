import { normalizeOnDeath, type OnDeathSpec } from "../../combat/death";
import type { Drop } from "../../game/lootTable";
import {
  DEFAULT_RARITY,
  resolveDeathDrops,
  type WorldItemSpawnInput,
} from "../../game/worldItem";
import type { GameContextContent } from "../gameContext";

/** @internal Inputs for routing a resolved lethal kill into bag grants and/or ground-item spawns. */
export interface LethalLootInput {
  /** Drops produced by the death system's resolution (already rolled). */
  drops: readonly Drop[];
  /** Resolved killer identity; environmental kills have no player recipient. */
  recipientUserId: string | undefined;
  /** Explicit any-death world rules may spawn items without a player recipient. */
  allowUnownedWorldDrops?: boolean;
  /** Catalog `onDeath` for the dying entity (drop mode + scatter). */
  onDeath: OnDeathSpec | undefined;
  /** World position of the dying entity — required for `dropMode: "world"`. */
  position: readonly [number, number, number] | undefined;
  /** Catalog id of the dying entity — used as loot source tag when present. */
  catalogId: string | undefined;
  content: GameContextContent;
  spawnWorldItem: (input: WorldItemSpawnInput) => void;
  grantToPlayer: (userId: string, drops: Drop[], source?: string) => void;
  /** The world's seeded stream — scatter positions must replay with the rest of the simulation. */
  rng: () => number;
}

/** @internal Only an explicit rule opts a catalog into unowned world drops. */
export function allowsUnownedWorldDrops(onDeath: OnDeathSpec | undefined): boolean {
  const normalized = normalizeOnDeath(onDeath);
  return normalized.dropMode === "world" && normalized.drops.some((rule) => rule.when?.reason === "any");
}

/**
 * Pure death→loot policy: scatter world items or grant straight into player bags.
 * Unowned deaths require explicit opt-in and never grant currency. Extracted from `createGameContext`
 * so combat install stays free of nested loot branching.
 * @internal
 */
export function applyLethalLoot(input: LethalLootInput): void {
  if (input.drops.length === 0) return;

  const normalizedOnDeath = normalizeOnDeath(input.onDeath);
  if (
    input.recipientUserId === undefined &&
    !(input.allowUnownedWorldDrops && normalizedOnDeath.dropMode === "world" && input.position !== undefined)
  ) return;
  if (normalizedOnDeath.dropMode === "world" && input.position !== undefined) {
    const resolved = resolveDeathDrops([...input.drops], {
      mode: "world",
      origin: input.position,
      rng: input.rng,
      resolveRarity: (itemId) => input.content.itemById?.(itemId)?.rarity ?? DEFAULT_RARITY,
      resolveBaseType: (itemId) => input.content.itemById?.(itemId)?.baseType ?? itemId,
      scatter: normalizedOnDeath.scatter,
      ...(input.catalogId !== undefined ? { source: input.catalogId } : {}),
    });
    for (const spawn of resolved.worldSpawns) input.spawnWorldItem(spawn);
    if (resolved.grants.length > 0 && input.recipientUserId !== undefined) {
      input.grantToPlayer(input.recipientUserId, resolved.grants, input.catalogId);
    }
  } else if (input.recipientUserId !== undefined) {
    input.grantToPlayer(input.recipientUserId, [...input.drops], input.catalogId);
  }
}
