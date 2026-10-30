import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { createLootRegistry } from "@jgengine/core/loot/lootTable";
import { createMotionTrack, type MotionTrack } from "@jgengine/core/movement/motionTrack";
import { pickWeighted } from "@jgengine/core/random/pick";
import { createRemainsField, type Remains, type RemainsField, type RemainsSnapshot, type RemainsStack } from "@jgengine/core/remains/remains";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createPacedSchedule, type PacedSchedule, type PacedScheduleState } from "@jgengine/core/time/pacedSchedule";
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

/** A crate on its way down: the plain data a save keeps, and its track rebuilt on restore. */
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

/** A save of the falling crates, each site's next release and the landed crates. */
export interface SupplyDropSave {
  seq: number;
  falling: SupplyCrate[];
  sites: Record<string, PacedScheduleState>;
  landed: RemainsSnapshot;
}

/** A crate's site, tier and release time, kept in its remains owner as `id|site|tier|releasedAt`. */
function ownerOf(crate: SupplyCrate): string {
  return `${crate.id}|${crate.site}|${crate.tier}|${crate.releasedAt}`;
}

function crateOf(owner: string): SupplyCrate | null {
  const [id, site, tier, released] = owner.split("|");
  if (id === undefined || site === undefined || tier === undefined || released === undefined) return null;
  const releasedAt = Number(released);
  return Number.isFinite(releasedAt) ? { id, site, tier, releasedAt } : null;
}

/**
 * Crates come down at the authored sites on their own clocks, a tier rolled by the site's odds, fall for
 * `FALL_SECONDS`, land with rolled loot, open only at the tier's level and break apart if left too long.
 */
function createSupplyDropField(ctx: GameContext, sites: readonly SupplySite[]) {
  const siteOf = new Map(sites.map((site) => [site.id, site]));
  const tierIds = new Set(SUPPLY_TIERS.map((tier) => tier.id));
  for (const site of sites) for (const entry of site.tiers) if (!tierIds.has(entry.tier)) throw new Error(`supply drop site ${site.id}: unknown tier ${entry.tier}`);
  const schedules = new Map<string, PacedSchedule>(sites.map((site) => [site.id, createPacedSchedule({ firstAt: 0, every: 0 }, ctx.rng)]));
  let falling = new Map<string, { crate: SupplyCrate; track: MotionTrack }>();
  let landed: RemainsField = createRemainsField({ lastsSeconds: CRATE_LASTS });
  let seq = 0;
  let seeded = false;

  const wait = (rng: () => number): number => SUPPLY_RESPAWN[0] + rng() * (SUPPLY_RESPAWN[1] - SUPPLY_RESPAWN[0]);
  const pickTier = (site: SupplySite, rng: () => number): string => {
    const chosen = pickWeighted(rng, site.tiers, (entry) => entry.weight);
    if (chosen === undefined) throw new Error(`supply drop site ${site.id} has no tier weight`);
    return chosen.tier;
  };
  const nextRelease = (site: string, at: number): void => {
    const schedule = schedules.get(site);
    if (schedule === undefined) return;
    schedule.retune({ firstAt: at });
    schedule.reset();
  };
  const trackOf = (crate: SupplyCrate): MotionTrack | null => {
    const site = siteOf.get(crate.site);
    if (site === undefined) return null;
    const [x, y, z] = site.at;
    return createMotionTrack({ points: [[x, y + DROP_HEIGHT, z], [x, y, z]], duration: FALL_SECONDS, startAt: crate.releasedAt });
  };
  const view = (crate: SupplyCrate, track: MotionTrack, now: number): SupplyDrop => {
    const position: [number, number, number] = [0, 0, 0];
    track.sampleInto(now, position);
    return { ...crate, position, altitude: position[1] - (siteOf.get(crate.site)?.at[1] ?? 0), landed: false, contents: [], until: null };
  };
  const down = (crate: SupplyCrate, entry: Remains): SupplyDrop => ({
    ...crate, position: [entry.at[0], entry.at[1], entry.at[2]], altitude: 0, landed: true, contents: entry.contents, until: entry.until,
  });
  const landedOf = (id: string): Remains | undefined => landed.list().find((entry) => crateOf(entry.owner)?.id === id);
  const busySites = (): Set<string> => {
    const busy = new Set<string>();
    for (const entry of falling.values()) busy.add(entry.crate.site);
    for (const entry of landed.list()) {
      const crate = crateOf(entry.owner);
      if (crate !== null) busy.add(crate.site);
    }
    return busy;
  };
  const release = (site: SupplySite, at: number, tier: string): SupplyCrate => {
    seq += 1;
    const crate: SupplyCrate = { id: `drop_${seq}`, site: site.id, tier, releasedAt: at };
    const track = trackOf(crate);
    if (track !== null) falling.set(crate.id, { crate, track });
    return crate;
  };

  return {
    tick(now: number, rng: () => number): void {
      if (!seeded) {
        seeded = true;
        // A world already under way: release times spread back over a crate's life, so some have landed.
        for (const site of sites) nextRelease(site.id, now - rng() * (FALL_SECONDS + CRATE_LASTS) + rng() * SUPPLY_RESPAWN[1] * 0.5);
      }
      const busy = busySites();
      for (const site of sites) {
        if (busy.has(site.id)) continue;
        const schedule = schedules.get(site.id);
        if (schedule === undefined) continue;
        const at = schedule.snapshot().nextAt;
        if (schedule.due(now).length > 0) release(site, at, pickTier(site, rng));
      }
      for (const [id, { crate, track }] of [...falling]) {
        if (!track.justArrived(now)) continue;
        falling.delete(id);
        const site = siteOf.get(crate.site);
        const left = site === undefined ? null : landed.leave({ owner: ownerOf(crate), at: site.at, contents: rollCrate(ctx, crate.tier, rng), now: track.arrivesAt() });
        if (left === null) nextRelease(crate.site, now + wait(rng));
      }
      for (const gone of landed.expire(now)) {
        const crate = crateOf(gone.owner);
        if (crate !== null) nextRelease(crate.site, now + wait(rng));
      }
    },
    list(now: number): SupplyDrop[] {
      return [
        ...[...falling.values()].map(({ crate, track }) => view(crate, track, now)),
        ...landed.list().flatMap((entry) => {
          const crate = crateOf(entry.owner);
          return crate === null ? [] : [down(crate, entry)];
        }),
      ];
    },
    nearest(at: readonly [number, number, number], reach: number): SupplyDrop | null {
      const entry = landed.nearest(at, reach);
      const crate = entry === null ? null : crateOf(entry.owner);
      return crate === null || entry === null ? null : down(crate, entry);
    },
    take(id: string, accept: (stack: RemainsStack) => number, now: number, rng: () => number): RemainsStack[] {
      const entry = landedOf(id);
      if (entry === undefined) return [];
      const taken = landed.take(entry.id, accept);
      const crate = crateOf(entry.owner);
      if (crate !== null && landedOf(id) === undefined) nextRelease(crate.site, now + wait(rng));
      return taken;
    },
    call(siteId: string, now: number, rng: () => number, tier?: string): SupplyDrop | null {
      const site = siteOf.get(siteId);
      if (site === undefined) return null;
      if (tier !== undefined && !tierIds.has(tier)) throw new Error(`supply drop: unknown tier ${tier}`);
      for (const [id, { crate }] of [...falling]) if (crate.site === siteId) falling.delete(id);
      for (const entry of [...landed.list()]) {
        const crate = crateOf(entry.owner);
        if (crate?.site === siteId) landed.take(entry.id, (stack) => stack.count);
      }
      const chosen = tier ?? pickTier(site, rng);
      const crate = release(site, now, chosen);
      const entry = falling.get(crate.id);
      return entry === undefined ? null : view(entry.crate, entry.track, now);
    },
    snapshot(): SupplyDropSave {
      return {
        seq,
        falling: [...falling.values()].map(({ crate }) => ({ ...crate })),
        sites: Object.fromEntries([...schedules].map(([site, schedule]) => [site, schedule.snapshot()])),
        landed: landed.snapshot(),
      };
    },
    restore(save: SupplyDropSave): void {
      seq = save.seq;
      falling = new Map();
      for (const crate of save.falling) {
        const track = siteOf.has(crate.site) ? trackOf(crate) : null;
        if (track !== null) falling.set(crate.id, { crate: { ...crate }, track });
      }
      for (const site of sites) {
        const schedule = schedules.get(site.id);
        const saved = save.sites[site.id];
        if (schedule !== undefined && saved !== undefined) schedule.restore(saved);
      }
      landed.restore(save.landed);
      seeded = true;
    },
    reset(): void {
      falling = new Map();
      landed = createRemainsField({ lastsSeconds: CRATE_LASTS });
      for (const schedule of schedules.values()) schedule.reset();
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
  return me === null ? null : dropsOf(ctx).nearest(me.position, OPEN_REACH);
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
  const taken = dropsOf(ctx).take(crate.id, (stack) => stow(ctx, stack.item, stack.count), ctx.time.now(), ctx.rng);
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
  const now = ctx.time.now();
  let best: { tier: string; distance: number; landed: boolean; altitude: number } | null = null;
  for (const drop of dropsOf(ctx).list(now)) {
    const distance = Math.hypot(drop.position[0] - me.position[0], drop.position[2] - me.position[2]);
    if (best === null || distance < best.distance) best = { tier: drop.tier, distance, landed: drop.landed, altitude: drop.altitude };
  }
  return best;
}

export function supplyDropsSave(ctx: GameContext) {
  return {
    key: "fernwild.supplyDrops2",
    snapshot: (): SupplyDropSave => dropsOf(ctx).snapshot(),
    hydrate: (data: SupplyDropSave) => dropsOf(ctx).restore(data),
  };
}

export function resetSupplyDrops(ctx: GameContext): void {
  dropsOf(ctx).reset();
}
