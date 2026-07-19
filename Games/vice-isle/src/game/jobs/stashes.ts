import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { grantCred } from "../progression/cred";
import { STASH_SPOTS } from "../world/districts";

/** World-item id every hidden stash pickup shares — the tick filters the ground on it. */
export const STASH_ITEM = "vice_stash";
export const STASH_PICKUP_RADIUS = 4;
export const STASH_PAYOUT = 300;
export const STASH_CRED = 25;
/** One-off reward for bagging every stash on the isle. */
export const STASH_COMPLETE_BONUS = 6000;

/** Collected authored stash ids — persisted with the whole-world save. */
export const stashStore = defineStore<string[] | undefined>("vice.stashes", undefined);

/**
 * Runtime map of authored stash id → live world-item instance id. Rebuilt each boot (the world items
 * themselves are re-derived from the persisted `stashStore` in {@link tickStashes}), so it is reset on
 * init rather than saved.
 */
const stashInstances = new Map<string, string>();

export function resetStashRuntime(): void {
  stashInstances.clear();
}

export function stashPayout(): number {
  return STASH_PAYOUT;
}

/** How many stashes are still out there for a given collected count. */
export function stashesRemaining(collected: number, total: number = STASH_SPOTS.length): number {
  return Math.max(0, total - collected);
}

function collectedSet(ctx: GameContext): Set<string> {
  return new Set(stashStore.read(ctx) ?? []);
}

/**
 * Reconcile and settle the hidden-stash hunt. Every uncollected authored spot keeps exactly one live
 * ground pickup — adopted from a restored world item when one already sits there, otherwise spawned —
 * so the set survives the whole-world save without ever double-spawning. Walking onto a stash consumes
 * its pickup, pays cash + cred, and (on the last one) drops the isle-wide completion bonus.
 */
export function tickStashes(ctx: GameContext): void {
  if (STASH_SPOTS.length === 0) return;
  const collected = collectedSet(ctx);

  for (const spot of STASH_SPOTS) {
    if (collected.has(spot.id)) continue;
    const known = stashInstances.get(spot.id);
    if (known !== undefined && ctx.scene.worldItem.get(known) !== null) continue;
    const [x, , z] = spot.position;
    const y = ctx.world.groundHeightAt(x, z);
    const adopted = ctx.scene.worldItem.nearestInRadius([x, y, z], 2, (record) => record.itemId === STASH_ITEM);
    if (adopted !== null) {
      stashInstances.set(spot.id, adopted);
      continue;
    }
    const record = ctx.scene.worldItem.spawn({ itemId: STASH_ITEM, position: [x, y + 0.4, z], rarity: "rare" });
    stashInstances.set(spot.id, record.instanceId);
  }

  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;

  for (const spot of STASH_SPOTS) {
    if (collected.has(spot.id)) continue;
    const dist = Math.hypot(player.position[0] - spot.position[0], player.position[2] - spot.position[2]);
    if (dist > STASH_PICKUP_RADIUS) continue;

    const instance = stashInstances.get(spot.id);
    if (instance !== undefined) ctx.scene.worldItem.consume(instance);
    stashInstances.delete(spot.id);

    const next = [...collected, spot.id];
    stashStore.write(ctx, next);
    ctx.game.economy.grant(ctx.player.userId, "cash", STASH_PAYOUT);
    grantCred(ctx, STASH_CRED);
    ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+$${STASH_PAYOUT} STASH`, kind: "good" });

    if (next.length >= STASH_SPOTS.length) {
      ctx.game.economy.grant(ctx.player.userId, "cash", STASH_COMPLETE_BONUS);
      ctx.game.feed.push("vice.log", {
        text: `Every stash on Vice Isle bagged — $${STASH_COMPLETE_BONUS} bonus.`,
      });
    } else {
      ctx.game.feed.push("vice.log", {
        text: `Stash bagged: ${spot.label} — $${STASH_PAYOUT}. ${stashesRemaining(next.length)} left.`,
      });
    }
    return;
  }
}
