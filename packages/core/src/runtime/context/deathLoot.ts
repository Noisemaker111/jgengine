import { normalizeOnDeath, type OnDeathSpec } from "../../combat/death";
import type { Drop } from "../../loot/lootTable";
import {
  resolveDeathDrops,
  type WorldItemSpawnInput,
} from "../../loot/groundItem";
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

/** The game's rarity for one dropped item: its catalog entry, else the game's declared baseline. */
function worldDropRarity(content: GameContextContent, itemId: string): string {
  const rarity = content.itemById?.(itemId)?.rarity ?? content.defaultRarity;
  if (rarity === undefined) {
    throw new RangeError(
      `world drop "${itemId}" needs a rarity: set its catalog entry or content.defaultRarity`,
    );
  }
  return rarity;
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
      resolveRarity: (itemId) => worldDropRarity(input.content, itemId),
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
