import {
  deathReasonFromEffect,
  normalizeOnDeath,
  type EffectDeathContext,
  type OnDeathSpec,
} from "../../combat/death";
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
  /** True when the killer is the local/host player this context is resolving loot for. */
  grantToLocalPlayer: boolean;
  /** Catalog `onDeath` for the dying entity (drop mode + scatter). */
  onDeath: OnDeathSpec | undefined;
  /** World position of the dying entity — required for `dropMode: "world"`. */
  position: readonly [number, number, number] | undefined;
  /** Catalog id of the dying entity — used as loot source tag when present. */
  catalogId: string | undefined;
  content: GameContextContent;
  spawnWorldItem: (input: WorldItemSpawnInput) => void;
  grantToPlayer: (userId: string, drops: Drop[], source?: string) => void;
  localUserId: string;
}

/**
 * Pure death→loot policy: when a kill yields drops for the local player, either scatter them as
 * world items (`dropMode: "world"`) or grant straight into bags. Extracted from `createGameContext`
 * so combat install stays free of nested loot branching.
 * @internal
 */
export function applyLethalLoot(input: LethalLootInput): void {
  if (input.drops.length === 0 || !input.grantToLocalPlayer) return;

  const normalizedOnDeath = normalizeOnDeath(input.onDeath);
  if (normalizedOnDeath.dropMode === "world" && input.position !== undefined) {
    const resolved = resolveDeathDrops([...input.drops], {
      mode: "world",
      origin: input.position,
      resolveRarity: (itemId) => input.content.itemById?.(itemId)?.rarity ?? DEFAULT_RARITY,
      resolveBaseType: (itemId) => input.content.itemById?.(itemId)?.baseType ?? itemId,
      scatter: normalizedOnDeath.scatter,
      ...(input.catalogId !== undefined ? { source: input.catalogId } : {}),
    });
    for (const spawn of resolved.worldSpawns) input.spawnWorldItem(spawn);
    if (resolved.grants.length > 0) {
      input.grantToPlayer(input.localUserId, resolved.grants, input.catalogId);
    }
  } else {
    input.grantToPlayer(input.localUserId, [...input.drops], input.catalogId);
  }
}

/** @internal Build the grant-to-local-player flag from a lethal effect context + local user id. */
export function isLocalPlayerKill(lethalCtx: EffectDeathContext, localUserId: string): boolean {
  const reason = deathReasonFromEffect({
    ...lethalCtx,
    userIdOf: (id) => (id === localUserId ? localUserId : undefined),
  });
  return reason.kind === "player_kill" && reason.killerUserId === localUserId;
}
