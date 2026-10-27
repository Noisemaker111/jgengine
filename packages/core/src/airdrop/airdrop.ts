// @skill jgengine-gameplay
import { createRemainsField, type RemainsSnapshot, type RemainsStack } from "../remains/remains";

type Vec3 = readonly [number, number, number];

/** One kind of drop: who may open it and the loot it rolls when it lands. */
export interface AirdropTier {
  id: string;
  /** The level a player needs to open it. */
  minLevel: number;
}

/** A place drops come down, and the tiers it sends with their odds. */
export interface AirdropSite {
  id: string;
  /** Where the crate lands. */
  at: Vec3;
  tiers: readonly { tier: string; weight: number }[];
}

/** {@link createAirdropField} setup. */
export interface AirdropOptions {
  tiers: readonly AirdropTier[];
  sites: readonly AirdropSite[];
  /** How far above its landing spot a crate starts down. */
  dropHeight: number;
  /** Seconds from release to landing. */
  fallSeconds: number;
  /** Seconds a landed crate stays before it breaks apart with what is left in it. */
  lastsSeconds: number;
  /** Seconds a site waits, between these two, after its crate is gone before the next one starts down. */
  respawnSeconds: readonly [number, number];
  /** The contents of a crate of `tier` that has just landed. */
  roll(tier: string, rng: () => number): readonly RemainsStack[];
}

/** A crate on its way down, or landed and waiting to be opened. */
export interface Airdrop {
  id: string;
  site: string;
  tier: string;
  /** Its landing spot. */
  at: Vec3;
  releasedAt: number;
  landsAt: number;
  /** When a landed crate breaks apart; null while it falls. */
  until: number | null;
  /** What it holds once landed; empty while it falls. */
  contents: readonly RemainsStack[];
}

/** What changed on one {@link AirdropField.tick}. */
export interface AirdropTick {
  released: Airdrop[];
  landed: Airdrop[];
  expired: Airdrop[];
}

/** A save of every crate falling and landed and each site's next release time. */
export interface AirdropSnapshot {
  seq: number;
  falling: Airdrop[];
  /** When each site with no crate sends its next one. */
  next: Record<string, number>;
  landed: RemainsSnapshot;
}

/** The live supply drops of a world, made by {@link createAirdropField}. */
export interface AirdropField {
  /** Release, land and expire crates up to `now`. The first tick seeds every site, some already landed. */
  tick(now: number, rng: () => number): AirdropTick;
  /** Every crate, falling or landed. */
  list(now: number): readonly Airdrop[];
  /** How high over its landing spot a crate is at `now`: `dropHeight` at release, 0 once landed. */
  altitude(drop: Airdrop, now: number): number;
  /** The nearest landed crate within `reach` (ground distance). */
  nearest(at: Vec3, reach: number, now: number): Airdrop | null;
  /** Whether a player of `level` may open a crate of `tier`. */
  opens(tier: string, level: number): boolean;
  /** The level a crate of `tier` asks for. */
  levelFor(tier: string): number;
  /**
   * Take a landed crate's stacks: `accept` says how many of each the taker had room for. An emptied crate is gone and its
   * site starts counting to the next one.
   */
  take(id: string, accept: (stack: RemainsStack) => number, now: number, rng: () => number): RemainsStack[];
  /**
   * Send a crate from `site` now, of `tier` or one rolled by the site's odds, replacing whatever crate the site holds.
   * For admin commands and scripted moments. Null for an unknown site.
   */
  call(site: string, now: number, rng: () => number, tier?: string): Airdrop | null;
  snapshot(): AirdropSnapshot;
  restore(snapshot: AirdropSnapshot): void;
  reset(): void;
}

/**
 * Supply drops: crates that come down at authored sites on a timer, a tier rolled per site by weight, fall for a while,
 * land with loot rolled for their tier, open only for players of the tier's level, and break apart if left too long.
 * Each site holds one crate at a time and sends the next a while after the last is emptied or gone.
 * @capability airdrops timed supply crates falling at authored sites, tiered by level, holding rolled loot, expiring when ignored
 */
export function createAirdropField(options: AirdropOptions): AirdropField {
  const tiers = new Map(options.tiers.map((tier) => [tier.id, tier]));
  for (const site of options.sites) {
    if (site.id.includes("|")) throw new Error(`airdrop site id may not hold "|": ${site.id}`);
    for (const entry of site.tiers) if (!tiers.has(entry.tier)) throw new Error(`airdrop site ${site.id}: unknown tier ${entry.tier}`);
    if (site.tiers.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0) <= 0) throw new Error(`airdrop site ${site.id} has no tier weight`);
  }
  const [respawnMin, respawnMax] = options.respawnSeconds;
  const landedField = () => createRemainsField({ lastsSeconds: options.lastsSeconds });
  let landed = landedField();
  let falling: Airdrop[] = [];
  let next = new Map<string, number>();
  let seq = 0;
  let seeded = false;
  /** Landed crates keep their own id, site, tier and release time in the remains' owner, as `id|site|tier|releasedAt`. */
  const ownerOf = (drop: Airdrop) => `${drop.id}|${drop.site}|${drop.tier}|${drop.releasedAt}`;
  const fromRemains = (entry: { id: string; owner: string; at: Vec3; contents: readonly RemainsStack[]; until: number }): Airdrop => {
    const [id, site, tier, released] = entry.owner.split("|") as [string, string, string, string];
    const releasedAt = Number(released);
    return { id, site, tier, at: entry.at, releasedAt, landsAt: releasedAt + options.fallSeconds, until: entry.until, contents: entry.contents };
  };
  const pickTier = (site: AirdropSite, rng: () => number): string => {
    const total = site.tiers.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    let roll = rng() * total;
    for (const entry of site.tiers) {
      roll -= Math.max(0, entry.weight);
      if (roll < 0) return entry.tier;
    }
    return site.tiers[site.tiers.length - 1]!.tier;
  };
  const wait = (rng: () => number) => respawnMin + rng() * (respawnMax - respawnMin);
  const landedAt = (siteId: string) => landed.list().filter((entry) => entry.owner.split("|")[1] === siteId);
  const remainsOf = (id: string) => landed.list().find((entry) => entry.owner.startsWith(`${id}|`));
  const occupied = (siteId: string) => falling.some((drop) => drop.site === siteId) || landedAt(siteId).length > 0;
  const release = (site: AirdropSite, at: number, tier: string): Airdrop => {
    next.delete(site.id);
    seq += 1;
    const drop: Airdrop = { id: `airdrop_${seq}`, site: site.id, tier, at: [site.at[0], site.at[1], site.at[2]], releasedAt: at, landsAt: at + options.fallSeconds, until: null, contents: [] };
    falling.push(drop);
    return drop;
  };

  return {
    tick(now, rng) {
      const result: AirdropTick = { released: [], landed: [], expired: [] };
      if (!seeded) {
        seeded = true;
        // A world already under way: release times spread back over a whole crate's life, so some have landed.
        for (const site of options.sites) if (!occupied(site.id)) next.set(site.id,now - rng() * (options.fallSeconds + options.lastsSeconds) + rng() * respawnMax * 0.5);
      }
      for (const site of options.sites) {
        const at = next.get(site.id);
        if (at === undefined || at > now || occupied(site.id)) continue;
        result.released.push(release(site, at, pickTier(site, rng)));
      }
      for (const drop of [...falling]) {
        if (drop.landsAt > now) continue;
        falling = falling.filter((entry) => entry !== drop);
        const left = landed.leave({ owner: ownerOf(drop), at: drop.at, contents: options.roll(drop.tier, rng), now: drop.landsAt });
        if (left === null) next.set(drop.site, now + wait(rng));
        else result.landed.push(fromRemains(left));
      }
      for (const gone of landed.expire(now)) {
        const drop = fromRemains(gone);
        next.set(drop.site, now + wait(rng));
        result.expired.push(drop);
      }
      return result;
    },
    list: () => [...falling, ...landed.list().map(fromRemains)],
    altitude(drop, now) {
      if (now >= drop.landsAt) return 0;
      const left = (drop.landsAt - now) / options.fallSeconds;
      return options.dropHeight * Math.min(1, Math.max(0, left));
    },
    nearest(at, reach) {
      const entry = landed.nearest(at, reach);
      return entry === null ? null : fromRemains(entry);
    },
    opens: (tier, level) => level >= (tiers.get(tier)?.minLevel ?? Infinity),
    levelFor: (tier) => tiers.get(tier)?.minLevel ?? Infinity,
    take(id, accept, now, rng) {
      const entry = remainsOf(id);
      if (entry === undefined) return [];
      const taken = landed.take(entry.id, accept);
      if (remainsOf(id) === undefined) next.set(fromRemains(entry).site, now + wait(rng));
      return taken;
    },
    call(siteId, now, rng, tier) {
      const site = options.sites.find((entry) => entry.id === siteId);
      if (site === undefined) return null;
      if (tier !== undefined && !tiers.has(tier)) throw new Error(`airdrop: unknown tier ${tier}`);
      falling = falling.filter((drop) => drop.site !== siteId);
      for (const entry of landedAt(siteId)) landed.take(entry.id, (stack) => stack.count);
      return release(site, now, tier ?? pickTier(site, rng));
    },
    snapshot: () => ({ seq, falling: structuredClone(falling), next: Object.fromEntries(next), landed: landed.snapshot() }),
    restore(snapshot) {
      seq = snapshot.seq;
      falling = structuredClone(snapshot.falling);
      next = new Map(Object.entries(snapshot.next));
      landed.restore(snapshot.landed);
      seeded = true;
    },
    reset() {
      landed = landedField();
      falling = [];
      next = new Map();
      seq = 0;
      seeded = false;
    },
  };
}
