import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { createLootRegistry } from "@jgengine/core/loot/lootTable";
import { createMotionTrack } from "@jgengine/core/movement/motionTrack";
import { pickWeighted } from "@jgengine/core/random/pick";
import { createRemainsField, type Remains, type RemainsField, type RemainsSnapshot, type RemainsStack } from "../engine-local/remains/remains";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createRefillSlots, type RefillSlotsState } from "@jgengine/core/time/refillSlots";
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
/** Seconds a site waits, between these two, after its crate is gone before the next one starts down. */
export const SUPPLY_RESPAWN: readonly [number, number] = [600, 1800];
const OPEN_REACH = 3;
const TIER_IDS = new Set(SUPPLY_TIERS.map((tier) => tier.id));

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

/** An authored drop site: where a crate lands and the tier odds it sends. */
export interface SupplySite {
  id: string;
  at: readonly [number, number, number];
  tiers: readonly { tier: string; weight: number }[];
}

/** The authored drop sites: each `supply_drop` marker, on the ground, with its biome's tier odds. */
export function supplySites(ctx: GameContext): SupplySite[] {
  return markersOfKind(editorLayers, "supply_drop").map((marker) => {
    const meta = marker.meta as { tiers: { tier: string; weight: number }[] };
    const { x, z } = marker.position;
    return { id: marker.id, at: [x, ctx.world.groundHeightAt(x, z), z] as const, tiers: meta.tiers };
  });
}

/** What a crate's remains carry: the crate, its site, its tier and when it started down. */
interface CrateData {
  crateId: string;
  site: string;
  tier: string;
  releasedAt: number;
}

/** A crate at its site: it starts down at `releasedAt` and lies where it lands. */
interface SupplyCrate {
  id: string;
  site: string;
  tier: string;
  releasedAt: number;
}

/** A crate where it is now: falling from its site or landed and waiting to be opened. */
interface SupplyDrop {
  id: string;
  site: string;
  tier: string;
  releasedAt: number;
  position: [number, number, number];
  altitude: number;
  landed: boolean;
  contents: readonly RemainsStack[];
  until: number | null;
}

/** A save of which sites hold a crate, when it started down, and what is in it. */
export interface SupplyDropSave {
  seq: number;
  sites: RefillSlotsState;
  crates: RemainsSnapshot<CrateData>;
}

/** The crate a landed remains entry belongs to. */
const crateOf = (data: CrateData): SupplyCrate => ({ id: data.crateId, site: data.site, tier: data.tier, releasedAt: data.releasedAt });

/** The payload a crate keeps with its remains. */
const dataOf = (crate: SupplyCrate): CrateData => ({ crateId: crate.id, site: crate.site, tier: crate.tier, releasedAt: crate.releasedAt });

const present = (drop: SupplyDrop | null): drop is SupplyDrop => drop !== null;

/** The tier a site sends, drawn from its weights. */
function pickTier(site: SupplySite, rng: () => number): string {
  const chosen = pickWeighted(rng, site.tiers, (entry) => entry.weight);
  if (chosen === undefined) throw new Error(`supply drop site ${site.id} has no tier weight`);
  return chosen.tier;
}

/** A site's first ready time: spread back over a crate's life, so a world already under way has crates down. */
const seedReadyAt = (now: number, rng: () => number): number => now - rng() * (FALL_SECONDS + CRATE_LASTS) + rng() * SUPPLY_RESPAWN[1] * 0.5;

/** A crate in the air where its fall has it at `now`. */
function flyingView(crate: SupplyCrate, now: number, site: SupplySite): SupplyDrop {
  const [x, y, z] = site.at;
  const position: [number, number, number] = [0, 0, 0];
  createMotionTrack({ points: [[x, y + DROP_HEIGHT, z], [x, y, z]], duration: FALL_SECONDS, startAt: crate.releasedAt }).sampleInto(now, position);
  return { ...crate, position, altitude: position[1] - y, landed: false, contents: [], until: null };
}

/** A crate down, where its remains lie. */
function landedView(crate: SupplyCrate, entry: Remains<CrateData>): SupplyDrop {
  return { ...crate, position: [entry.at[0], entry.at[1], entry.at[2]], altitude: 0, landed: true, contents: entry.contents, until: entry.until };
}

/** A crate where it is at `now`: on its way down, or down where its remains lie. */
function crateView(entry: Remains<CrateData>, now: number, siteOf: ReadonlyMap<string, SupplySite>): SupplyDrop | null {
  const data = entry.data;
  if (data === undefined) return null;
  const site = siteOf.get(data.site);
  const crate = crateOf(data);
  return site !== undefined && now < entry.leftAt + FALL_SECONDS ? flyingView(crate, now, site) : landedView(crate, entry);
}

/** The closest landed crate within `reach` of `at` on the ground plane. */
function nearestLanded(drops: readonly SupplyDrop[], at: readonly [number, number, number], reach: number): SupplyDrop | null {
  let best: SupplyDrop | null = null;
  let bestDistance = reach;
  for (const drop of drops) {
    if (!drop.landed) continue;
    const distance = Math.hypot(drop.position[0] - at[0], drop.position[2] - at[2]);
    if (distance <= bestDistance) {
      best = drop;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Crates come down at the authored sites on their own clocks, a tier rolled by the site's odds, fall for
 * `FALL_SECONDS`, land with rolled loot, open only at the tier's level and break apart if left too long.
 */
function createSupplyDropField(ctx: GameContext, sites: readonly SupplySite[]) {
  const siteOf = new Map(sites.map((site) => [site.id, site]));
  for (const site of sites) for (const entry of site.tiers) if (!TIER_IDS.has(entry.tier)) throw new Error(`supply drop site ${site.id}: unknown tier ${entry.tier}`);
  const slots = createRefillSlots({ slots: sites.map((site) => site.id), refillSeconds: SUPPLY_RESPAWN }, ctx.rng);
  const crates: RemainsField<CrateData> = createRemainsField<CrateData>({ lastsSeconds: FALL_SECONDS + CRATE_LASTS });
  let seq = 0;
  let seeded = false;
  const leaveCrate = (site: SupplySite, crate: SupplyCrate): boolean =>
    crates.leave({ owner: crate.id, at: site.at, contents: rollCrate(ctx, crate.tier, ctx.rng), now: crate.releasedAt, data: dataOf(crate) }) !== null;
  const views = (now: number): SupplyDrop[] => crates.list().map((entry) => crateView(entry, now, siteOf)).filter(present);

  return {
    tick(now: number, rng: () => number): void {
      if (!seeded) for (const site of sites) slots.readyAt(site.id, seedReadyAt(now, rng));
      const readyAt = slots.snapshot().slots;
      for (const id of slots.ready(now)) {
        const site = siteOf.get(id);
        if (site === undefined) continue;
        const crate: SupplyCrate = { id: `drop_${++seq}`, site: id, tier: pickTier(site, rng), releasedAt: readyAt[id]?.readyAt ?? now };
        if (leaveCrate(site, crate)) slots.fill(id);
        else slots.empty(id, now);
      }
      for (const gone of crates.expire(now)) if (gone.data !== undefined) slots.empty(gone.data.site, now);
      seeded = true;
    },
    list: views,
    nearest: (at: readonly [number, number, number], reach: number, now: number) => nearestLanded(views(now), at, reach),
    take(id: string, accept: (stack: RemainsStack) => number, now: number): RemainsStack[] {
      const entry = crates.list().find((one) => one.data?.crateId === id);
      if (entry?.data === undefined) return [];
      const taken = crates.take(entry.id, accept);
      if (!crates.list().some((one) => one.id === entry.id)) slots.empty(entry.data.site, now);
      return taken;
    },
    call(siteId: string, now: number, rng: () => number, tier?: string): SupplyDrop | null {
      const site = siteOf.get(siteId);
      if (site === undefined) return null;
      if (tier !== undefined && !TIER_IDS.has(tier)) throw new Error(`supply drop: unknown tier ${tier}`);
      for (const entry of [...crates.list()]) if (entry.data?.site === siteId) crates.take(entry.id, (stack) => stack.count);
      const crate: SupplyCrate = { id: `drop_${++seq}`, site: siteId, tier: tier ?? pickTier(site, rng), releasedAt: now };
      const left = leaveCrate(site, crate);
      if (left) slots.fill(siteId);
      return left ? flyingView(crate, now, site) : null;
    },
    snapshot: (): SupplyDropSave => ({ seq, sites: slots.snapshot(), crates: crates.snapshot() }),
    restore(save: SupplyDropSave): void {
      seq = save.seq;
      slots.restore(save.sites);
      crates.restore(save.crates);
      seeded = true;
    },
    reset: () => {
      crates.reset();
      slots.reset();
      seq = 0;
      seeded = false;
    },
  };
}

const dropsOf = perContext((ctx) => createSupplyDropField(ctx, supplySites(ctx)));

/** Every crate in the world, falling or down, where it is now. */
export function supplyDrops(ctx: GameContext): { id: string; tier: string; color: string; position: [number, number, number]; landed: boolean }[] {
  return dropsOf(ctx).list(ctx.time.now()).map((drop) => ({
    id: drop.id,
    tier: drop.tier,
    color: supplyTier(drop.tier)?.color ?? "#ffffff",
    position: drop.position,
    landed: drop.landed,
  }));
}

function crateNear(ctx: GameContext): SupplyDrop | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  return me === null ? null : dropsOf(ctx).nearest(me.position, OPEN_REACH, ctx.time.now());
}

/** E at a landed crate: if you are of its level, take all that fits; the rest stays in it. */
export function openCrate(ctx: GameContext): void {
  const crate = crateNear(ctx);
  if (crate === null) return;
  const tier = supplyTier(crate.tier);
  if (tier === null) return;
  if (survivorLevel(ctx) < tier.minLevel) {
    ctx.game.notices.push({ text: `${tier.label} crate: requires level ${tier.minLevel}`, tone: "deny" });
    return;
  }
  const taken = dropsOf(ctx).take(crate.id, (stack) => stow(ctx, stack.item, stack.count), ctx.time.now());
  const still = dropsOf(ctx).list(ctx.time.now()).some((drop) => drop.id === crate.id);
  const stacks = taken.length;
  ctx.game.notices.push(
    still
      ? { text: `Took ${stacks} ${stacks === 1 ? "stack" : "stacks"}; no room for the rest`, tone: "deny" }
      : { text: `${tier.label} crate: ${taken.map((stack) => `${stack.count} ${itemLabel(stack.item)}`).join(", ")}`, tone: "success" },
  );
}

export function supplyDropPrompts(ctx: GameContext): PositionedPrompt[] {
  const crate = crateNear(ctx);
  const tier = crate === null ? null : supplyTier(crate.tier);
  if (crate === null || tier === null) return [];
  return [{ id: `crate:${crate.id}`, position: { x: crate.position[0], z: crate.position[2] }, priority: 4, prompt: proximityPrompt({ radius: OPEN_REACH + 1, display: keybind("interact", `Open ${tier.label} Supply Crate (level ${tier.minLevel})`), invoke: command("openCrate") }) }];
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
  let best: { tier: string; distance: number; landed: boolean; altitude: number } | null = null;
  for (const drop of dropsOf(ctx).list(ctx.time.now())) {
    const distance = Math.hypot(drop.position[0] - me.position[0], drop.position[2] - me.position[2]);
    if (best === null || distance < best.distance) best = { tier: drop.tier, distance, landed: drop.landed, altitude: drop.altitude };
  }
  return best;
}

export function supplyDropsSave(ctx: GameContext) {
  return {
    key: "fernwild.supplyDrops3",
    snapshot: (): SupplyDropSave => dropsOf(ctx).snapshot(),
    hydrate: (data: SupplyDropSave) => dropsOf(ctx).restore(data),
  };
}

export function resetSupplyDrops(ctx: GameContext): void {
  dropsOf(ctx).reset();
}
