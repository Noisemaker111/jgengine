import { createAirdropField, type Airdrop, type AirdropField, type AirdropSnapshot } from "@jgengine/core/airdrop/airdrop";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { createLootRegistry } from "@jgengine/core/loot/lootTable";
import type { RemainsStack } from "@jgengine/core/remains/remains";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";
import { stow } from "./bags";
import { itemLabel } from "./data/items";
import { SUPPLY_TIERS, supplyTier } from "./data/supplyDrops";
import { survivorLevel } from "./survivor";

/**
 * ARK's crates fall slowly for "a few minutes" from high above and last a while once down; the wiki gives no exact
 * numbers, so these are approximate.
 */
export const DROP_HEIGHT = 150;
export const FALL_SECONDS = 120;
export const CRATE_LASTS = 1200;
const RESPAWN: readonly [number, number] = [600, 1800];
const OPEN_REACH = 3;

const lootOf = perContext((ctx) => {
  const loot = createLootRegistry({ rng: ctx.rng });
  for (const tier of SUPPLY_TIERS) loot.register({ id: tier.id, rolls: tier.rolls, entries: [...tier.loot] });
  return loot;
});

/** A crate's rolled loot, the same item from two picks merged into one stack. */
export function rollCrate(ctx: GameContext, tier: string, rng: () => number = ctx.rng): RemainsStack[] {
  const merged = new Map<string, number>();
  for (const drop of lootOf(ctx).roll(tier, rng)) if (drop.item !== undefined) merged.set(drop.item, (merged.get(drop.item) ?? 0) + drop.count);
  return [...merged].map(([item, count]) => ({ item, count }));
}

/** The authored drop sites: each `supply_drop` marker, on the ground, with its biome's tier odds. */
export function supplySites(ctx: GameContext) {
  return markersOfKind(editorLayers, "supply_drop").map((marker) => {
    const meta = marker.meta as { tiers: { tier: string; weight: number }[] };
    const { x, z } = marker.position;
    return { id: marker.id, at: [x, ctx.world.groundHeightAt(x, z), z] as const, tiers: meta.tiers };
  });
}

const dropsOf = perContext(
  (ctx): AirdropField =>
    createAirdropField({
      tiers: SUPPLY_TIERS.map((tier) => ({ id: tier.id, minLevel: tier.minLevel })),
      sites: supplySites(ctx),
      dropHeight: DROP_HEIGHT,
      fallSeconds: FALL_SECONDS,
      lastsSeconds: CRATE_LASTS,
      respawnSeconds: RESPAWN,
      roll: (tier, rng) => rollCrate(ctx, tier, rng),
    }),
);

/** Every crate in the world, falling or down, where it is now. */
export function supplyDrops(ctx: GameContext): { id: string; tier: string; color: string; position: [number, number, number]; landed: boolean }[] {
  const now = ctx.time.now();
  const field = dropsOf(ctx);
  return field.list(now).map((drop) => ({
    id: drop.id,
    tier: drop.tier,
    color: supplyTier(drop.tier)!.color,
    position: [drop.at[0], drop.at[1] + field.altitude(drop, now), drop.at[2]],
    landed: drop.until !== null,
  }));
}

function crateNear(ctx: GameContext): Airdrop | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  return me === null ? null : dropsOf(ctx).nearest(me.position, OPEN_REACH, ctx.time.now());
}

/** E at a landed crate: if you are of its level, take all that fits; the rest stays in it. */
export function openCrate(ctx: GameContext): void {
  const crate = crateNear(ctx);
  if (crate === null) return;
  const field = dropsOf(ctx);
  const tier = supplyTier(crate.tier)!;
  if (!field.opens(crate.tier, survivorLevel(ctx))) {
    ctx.game.notices.push({ text: `${tier.label} crate: requires level ${tier.minLevel}`, tone: "deny" });
    return;
  }
  const taken = field.take(crate.id, (stack) => stow(ctx, stack.item, stack.count), ctx.time.now(), ctx.rng);
  const still = field.list(ctx.time.now()).some((drop) => drop.id === crate.id);
  const stacks = taken.length;
  ctx.game.notices.push(
    still
      ? { text: `Took ${stacks} ${stacks === 1 ? "stack" : "stacks"}; no room for the rest`, tone: "deny" }
      : { text: `${tier.label} crate: ${taken.map((stack) => `${stack.count} ${itemLabel(stack.item)}`).join(", ")}`, tone: "success" },
  );
}

export function supplyDropPrompts(ctx: GameContext): PositionedPrompt[] {
  const crate = crateNear(ctx);
  if (crate === null) return [];
  const tier = supplyTier(crate.tier)!;
  return [{ id: `crate:${crate.id}`, position: { x: crate.at[0], z: crate.at[2] }, priority: 4, prompt: proximityPrompt({ radius: OPEN_REACH + 1, display: keybind("interact", `Open ${tier.label} Supply Crate (level ${tier.minLevel})`), invoke: command("openCrate") }) }];
}

/** Crates start down, land and break apart on their own clocks. */
export function tickSupplyDrops(ctx: GameContext): void {
  dropsOf(ctx).tick(ctx.time.now(), ctx.rng);
}

/** ARK's admin drop, for proofs: send a crate of `tier` from the drop site nearest the survivor. Returns its site. */
export function callSupplyDrop(ctx: GameContext, tier?: string): string | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return null;
  let best: { id: string; distance: number } | null = null;
  for (const site of supplySites(ctx)) {
    const distance = Math.hypot(site.at[0] - me.position[0], site.at[2] - me.position[2]);
    if (best === null || distance < best.distance) best = { id: site.id, distance };
  }
  if (best === null) return null;
  dropsOf(ctx).call(best.id, ctx.time.now(), ctx.rng, tier);
  return best.id;
}

/** The nearest crate for the HUD and probes: its tier, how far, and whether it is down yet. */
export function nearestSupplyDrop(ctx: GameContext): { tier: string; distance: number; landed: boolean; altitude: number } | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return null;
  const now = ctx.time.now();
  const field = dropsOf(ctx);
  let best: { tier: string; distance: number; landed: boolean; altitude: number } | null = null;
  for (const drop of field.list(now)) {
    const distance = Math.hypot(drop.at[0] - me.position[0], drop.at[2] - me.position[2]);
    if (best === null || distance < best.distance) best = { tier: drop.tier, distance, landed: drop.until !== null, altitude: field.altitude(drop, now) };
  }
  return best;
}

export function supplyDropsSave(ctx: GameContext) {
  return {
    key: "fernwild.supplyDrops",
    snapshot: (): AirdropSnapshot => dropsOf(ctx).snapshot(),
    hydrate: (data: AirdropSnapshot) => dropsOf(ctx).restore(data),
  };
}

export function resetSupplyDrops(ctx: GameContext): void {
  dropsOf(ctx).reset();
}
